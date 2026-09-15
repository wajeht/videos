import { spawn } from "node:child_process";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { Configuration } from "../config.js";
import type { LibraryRepository } from "./library.repository.js";
import type { VideoRecord } from "./types.js";
import { logCause, type Logger } from "../logger.js";
import type { ConversionRepository, StoredConversion } from "./conversion.repository.js";
import { ffmpegExecutable } from "./executables.js";
import { resolveContainedPath } from "./path.js";

export type ConversionExecutor = (
  video: VideoRecord,
  onProgress: (progress: number) => Promise<void>,
) => Promise<void>;

export interface ConversionRecord extends StoredConversion {
  playlistPath: string;
}

export interface ConversionManager {
  requestConversion(video: VideoRecord): Promise<ConversionRecord>;
  retryConversion(video: VideoRecord): Promise<ConversionRecord>;
  getConversion(videoId: string): Promise<ConversionRecord | null>;
  recoverConversions(): Promise<void>;
}

export interface ConversionPlan {
  videoCodec: "copy" | "h264_qsv";
  audioCodec: "copy" | "aac";
}

export const conversionCacheVersion = 2;
export const conversionPlaylistFilename = `index-v${conversionCacheVersion}.m3u8`;

export function hlsDirectory(dataDirectory: string): string {
  return path.join(dataDirectory, "hls");
}

export function planConversion(
  video: Pick<VideoRecord, "videoCodec" | "audioCodec">,
): ConversionPlan {
  return {
    videoCodec: video.videoCodec === "h264" ? "copy" : "h264_qsv",
    audioCodec: video.audioCodec === null || video.audioCodec === "aac" ? "copy" : "aac",
  };
}

async function writeProgressAfter(
  previousWrite: Promise<void>,
  onProgress: (progress: number) => Promise<void>,
  progress: number,
): Promise<void> {
  await previousWrite;
  await onProgress(progress);
}

export function createFfmpegConversionExecutor(configuration: Configuration): ConversionExecutor {
  return async (video, onProgress) => {
    const source = await resolveContainedPath(configuration.media.videosDirectory, video.path);
    const outputDirectory = path.join(hlsDirectory(configuration.media.dataDirectory), video.id);
    const playlist = path.join(outputDirectory, conversionPlaylistFilename);
    await fs.rm(outputDirectory, { recursive: true, force: true });
    await fs.mkdir(outputDirectory, { recursive: true });

    const plan = planConversion(video);
    const requiresQuickSync = plan.videoCodec === "h264_qsv";
    const hardwareInputArguments = requiresQuickSync
      ? [
          "-qsv_device",
          configuration.media.qsvDevice,
          "-hwaccel",
          "qsv",
          "-hwaccel_output_format",
          "qsv",
        ]
      : [];
    const videoCodecArguments =
      plan.videoCodec === "copy" ? ["-c:v", "copy"] : ["-c:v", "h264_qsv", "-global_quality", "23"];
    const audioCodecArguments = ["-c:a", plan.audioCodec];

    if (requiresQuickSync) {
      try {
        await fs.access(configuration.media.qsvDevice, constants.R_OK | constants.W_OK);
      } catch {
        throw new Error(
          `Intel Quick Sync is unavailable at ${configuration.media.qsvDevice}; CPU fallback is disabled`,
        );
      }
    }

    const arguments_ = [
      "-v",
      "error",
      "-y",
      ...hardwareInputArguments,
      "-i",
      source,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      ...videoCodecArguments,
      ...audioCodecArguments,
      "-f",
      "hls",
      "-hls_time",
      "6",
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "event",
      "-hls_flags",
      "independent_segments+temp_file",
      "-hls_segment_filename",
      path.join(outputDirectory, "segment-%05d.ts"),
      "-progress",
      "pipe:1",
      "-nostats",
      playlist,
    ];

    await new Promise<void>((resolve, reject) => {
      const process = spawn(ffmpegExecutable, arguments_, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      let output = "";
      let lastProgress = 0;
      let progressWrites = Promise.resolve();

      process.stdout.setEncoding("utf8");
      process.stdout.on("data", (chunk: string) => {
        output += chunk;
        const lines = output.split("\n");
        output = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("out_time_us=")) continue;
          const microseconds = Number(line.slice("out_time_us=".length));
          const progress = Math.min(
            99,
            Math.round((microseconds / 1_000_000 / Number(video.durationSeconds)) * 100),
          );
          if (progress >= lastProgress + 2) {
            lastProgress = progress;
            progressWrites = writeProgressAfter(progressWrites, onProgress, progress);
          }
        }
      });
      process.stderr.setEncoding("utf8");
      process.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-8_000);
      });
      process.on("error", reject);
      process.on("close", async (code) => {
        await progressWrites;
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
      });
    });
  };
}

export function createConversionManager(options: {
  repository: ConversionRepository;
  library: LibraryRepository;
  configuration: Configuration;
  logger: Logger;
  executor?: ConversionExecutor;
}): ConversionManager {
  const executor = options.executor ?? createFfmpegConversionExecutor(options.configuration);
  const queue: string[] = [];
  const scheduled = new Set<string>();
  let processing = false;

  function conversionRecord(stored: StoredConversion): ConversionRecord {
    return {
      ...stored,
      playlistPath: path.join(
        hlsDirectory(options.configuration.media.dataDirectory),
        stored.videoId,
        conversionPlaylistFilename,
      ),
    };
  }

  function enqueueVideo(videoId: string): void {
    if (scheduled.has(videoId)) return;
    scheduled.add(videoId);
    queue.push(videoId);
    void processQueue();
  }

  async function processQueue(): Promise<void> {
    if (processing) return;
    processing = true;
    try {
      while (queue.length > 0) {
        const videoId = queue.shift();
        if (!videoId) continue;
        const video = await options.library.getVideo(videoId);
        if (!video) {
          scheduled.delete(videoId);
          continue;
        }
        await options.repository.markConverting(videoId);
        try {
          await executor(video, (progress) => options.repository.updateProgress(videoId, progress));
          await options.repository.markReady(videoId);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Conversion failed";
          await options.repository.markFailed(videoId, message);
          options.logger.error("Video conversion failed", { videoId, error: logCause(error) });
        } finally {
          scheduled.delete(videoId);
        }
      }
    } finally {
      processing = false;
    }
  }

  async function queueVideo(video: VideoRecord, force: boolean): Promise<ConversionRecord> {
    const stored = await options.repository.getConversion(video.id);
    if (!force && stored) {
      const existing = conversionRecord(stored);
      if (existing.status !== "ready" || (await hasConversionPlaylist(existing))) return existing;
      options.logger.warn("Rebuilding missing conversion cache", { videoId: video.id });
    }
    await options.repository.queueConversion(video.id);
    enqueueVideo(video.id);
    return conversionRecord((await options.repository.getConversion(video.id))!);
  }

  return {
    requestConversion: (video) => queueVideo(video, false),
    retryConversion: (video) => queueVideo(video, true),
    async getConversion(videoId) {
      const stored = await options.repository.getConversion(videoId);
      return stored ? conversionRecord(stored) : null;
    },
    async recoverConversions() {
      for (const videoId of await options.repository.listPendingVideoIds()) {
        await options.repository.queueConversion(videoId);
        enqueueVideo(videoId);
      }
    },
  };
}

async function hasConversionPlaylist(record: ConversionRecord): Promise<boolean> {
  try {
    await fs.access(record.playlistPath);
    return true;
  } catch {
    return false;
  }
}
