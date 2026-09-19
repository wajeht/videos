import fs from "node:fs/promises";

import type { LibraryRepository } from "../media/library.repository.js";
import {
  conversionPlaylistFilename,
  type ConversionManager,
  type ConversionRecord,
} from "../media/conversion.js";

export interface PlaybackService {
  preparePlayback(videoId: string): Promise<PlaybackResult | null>;
  retryConversion(videoId: string): Promise<PlaybackResult | null>;
  getConversionStatus(videoId: string): Promise<PlaybackResult | null>;
}

export type PlaybackResult =
  | { kind: "direct"; url: string }
  | { kind: "hls"; url: string; status: "converting" | "ready"; progress: number }
  | { kind: "converting"; status: "queued" | "converting"; progress: number }
  | { kind: "error"; message: string };

async function resolveConversionPlayback(
  record: ConversionRecord | null,
): Promise<PlaybackResult | null> {
  if (!record) return null;
  if (record.status === "queued")
    return { kind: "converting", status: "queued", progress: record.progress };
  if (record.status === "failed")
    return { kind: "error", message: "We couldn't prepare this video. Try again." };
  try {
    await fs.access(record.playlistPath);
    return {
      kind: "hls",
      url: `/hls/${record.videoId}/${record.generation}/${conversionPlaylistFilename}`,
      status: record.status === "ready" ? "ready" : "converting",
      progress: record.progress,
    };
  } catch {
    // The playlist may not exist until FFmpeg writes its first segment.
  }
  return {
    kind: "converting",
    status: record.status === "ready" ? "converting" : record.status,
    progress: record.progress,
  };
}

export function createPlaybackService(
  library: LibraryRepository,
  conversions: ConversionManager,
): PlaybackService {
  return {
    async preparePlayback(videoId) {
      const video = await library.getVideo(videoId);
      if (!video) return null;
      if (video.browserCompatible) return { kind: "direct", url: `/media/${videoId}` };
      return resolveConversionPlayback(await conversions.requestConversion(video));
    },
    async retryConversion(videoId) {
      const video = await library.getVideo(videoId);
      return video ? resolveConversionPlayback(await conversions.retryConversion(video)) : null;
    },
    async getConversionStatus(videoId) {
      const record = await conversions.getConversion(videoId);
      return record ? resolveConversionPlayback(record) : null;
    },
  };
}
