import { spawn } from "node:child_process";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { Configuration } from "../config.js";
import type { LibraryRepository } from "./library.repository.js";
import type { VideoRecord } from "./types.js";
import { logCause, type Logger } from "../logger.js";
import { hasErrorCode } from "../errors.js";
import type { ConversionRepository, StoredConversion } from "./conversion.repository.js";
import { ffmpegExecutable } from "./executables.js";
import { resolveContainedPath } from "./path.js";
import { conversionGeneration } from "./conversion-source.js";

export type ConversionExecutor = (
  video: VideoRecord,
  onProgress: (progress: number) => Promise<void>,
  generation: string,
) => Promise<void>;

export interface ConversionRecord extends StoredConversion {
  playlistPath: string;
}

export interface ConversionManager {
  requestConversion(video: VideoRecord): Promise<ConversionRecord | null>;
  retryConversion(video: VideoRecord): Promise<ConversionRecord | null>;
  getConversion(videoId: string): Promise<ConversionRecord | null>;
  recoverConversions(): Promise<void>;
  synchronize(): Promise<void>;
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
  return async (video, onProgress, generation) => {
    const source = await resolveContainedPath(configuration.media.videosDirectory, video.path);
    const outputDirectory = path.join(
      hlsDirectory(configuration.media.dataDirectory),
      video.id,
      generation,
    );
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
  const queue: Array<{ video: VideoRecord; record: StoredConversion }> = [];
  const scheduled = new Map<string, StoredConversion>();
  const locks = new Map<string, Promise<unknown>>();
  const pendingCleanup = new Set<string>();
  const directory = hlsDirectory(options.configuration.media.dataDirectory);
  let processing = false;

  function withVideoLock<T>(videoId: string, operation: () => Promise<T>): Promise<T> {
    const previous = locks.get(videoId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    locks.set(videoId, current);
    const release = () => {
      if (locks.get(videoId) === current) locks.delete(videoId);
    };
    void current.then(release, release);
    return current;
  }

  function conversionRecord(stored: StoredConversion): ConversionRecord {
    return {
      ...stored,
      playlistPath: path.join(
        directory,
        stored.videoId,
        stored.generation,
        conversionPlaylistFilename,
      ),
    };
  }

  async function pruneVideo(videoId: string): Promise<void> {
    const retained = new Set(
      [...scheduled.values()]
        .filter((record) => record.videoId === videoId)
        .map((record) => record.generation),
    );
    const current = await options.repository.getConversion(videoId);
    if (current) retained.add(current.generation);
    const videoDirectory = path.join(directory, videoId);
    if (retained.size === 0) {
      await fs.rm(videoDirectory, { recursive: true, force: true });
      pendingCleanup.delete(videoId);
      return;
    }
    try {
      for (const entry of await fs.readdir(videoDirectory)) {
        if (!retained.has(entry))
          await fs.rm(path.join(videoDirectory, entry), { recursive: true, force: true });
      }
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) throw error;
    }
    if (![...scheduled.values()].some((record) => record.videoId === videoId))
      pendingCleanup.delete(videoId);
  }

  async function processJob(video: VideoRecord, record: StoredConversion): Promise<void> {
    try {
      const current = await options.repository.getConversion(video.id);
      if (current?.generation !== record.generation) return;
      await options.repository.markConverting(record);
      try {
        await executor(
          video,
          (progress) => options.repository.updateProgress(record, progress),
          record.generation,
        );
        await options.repository.markReady(record);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Conversion failed";
        await options.repository.markFailed(record, message);
        options.logger.error("Video conversion failed", {
          videoId: video.id,
          error: logCause(error),
        });
      }
    } finally {
      scheduled.delete(record.generation);
      if (pendingCleanup.has(video.id)) await withVideoLock(video.id, () => pruneVideo(video.id));
    }
  }

  async function processQueue(): Promise<void> {
    if (processing) return;
    processing = true;
    try {
      while (queue.length > 0) {
        const job = queue.shift();
        if (job) await processJob(job.video, job.record);
      }
    } finally {
      processing = false;
    }
  }

  async function queueVideo(videoId: string, force: boolean): Promise<ConversionRecord | null> {
    return withVideoLock(videoId, async () => {
      // A scan can replace the source between the read and the transactional enqueue.
      while (true) {
        const video = await options.library.getVideo(videoId);
        if (!video) return null;
        const stored = await options.repository.getConversion(videoId);
        if (stored) {
          const existing = conversionRecord(stored);
          if (scheduled.has(stored.generation)) return existing;
          if (!force && (existing.status !== "ready" || (await hasConversionPlaylist(existing))))
            return existing;
        }
        const record = await options.repository.queueConversion(video, conversionGeneration(video));
        if (!record) continue;
        scheduled.set(record.generation, record);
        queue.push({ video, record });
        void processQueue().catch((error) => {
          options.logger.error("Conversion queue failed", { error: logCause(error) });
        });
        return conversionRecord(record);
      }
    });
  }

  return {
    requestConversion: (video) => queueVideo(video.id, false),
    retryConversion: (video) => queueVideo(video.id, true),
    async getConversion(videoId) {
      const stored = await options.repository.getConversion(videoId);
      return stored ? conversionRecord(stored) : null;
    },
    async recoverConversions() {
      for (const videoId of await options.repository.listPendingVideoIds()) {
        await queueVideo(videoId, true);
      }
    },
    async synchronize() {
      const videoIds = new Set([...scheduled.values()].map((record) => record.videoId));
      try {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          if (entry.isDirectory() && /^[a-f0-9]{24}$/.test(entry.name)) videoIds.add(entry.name);
        }
      } catch (error) {
        if (!hasErrorCode(error, "ENOENT")) throw error;
      }
      for (const videoId of videoIds) {
        pendingCleanup.add(videoId);
        await withVideoLock(videoId, () => pruneVideo(videoId));
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
