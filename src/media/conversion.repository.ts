import type { Knex } from "knex";

import type { VideoRecord } from "./types.js";
import { conversionGeneration } from "./conversion-source.js";

export type ConversionState = "queued" | "converting" | "ready" | "failed";

export interface StoredConversion {
  videoId: string;
  generation: string;
  sourceModifiedAt: string;
  sourceSizeBytes: number;
  status: ConversionState;
  progress: number;
  error: string | null;
}

export interface ConversionRepository {
  getConversion(videoId: string): Promise<StoredConversion | null>;
  queueConversion(video: VideoRecord, generation: string): Promise<StoredConversion | null>;
  markConverting(record: StoredConversion): Promise<void>;
  updateProgress(record: StoredConversion, progress: number): Promise<void>;
  markReady(record: StoredConversion): Promise<void>;
  markFailed(record: StoredConversion, error: string): Promise<void>;
  listPendingVideoIds(): Promise<string[]>;
}

interface ConversionRow {
  error: string | null;
  progress: number;
  status: ConversionState;
  video_id: string;
}

type ConversionUpdate = Partial<Pick<ConversionRow, "error" | "progress" | "status">>;

export function createConversionRepository(database: Knex): ConversionRepository {
  async function updateConversion(
    record: StoredConversion,
    values: ConversionUpdate,
  ): Promise<void> {
    await database<ConversionRow>("conversions")
      .where({ video_id: record.videoId })
      .whereExists(
        database("videos").select("id").where({
          id: record.videoId,
          modified_at: record.sourceModifiedAt,
          size_bytes: record.sourceSizeBytes,
        }),
      )
      .update(values);
  }

  return {
    async getConversion(videoId) {
      const row = await database<ConversionRow & { modified_at: string; size_bytes: number }>(
        "conversions",
      )
        .join("videos", "videos.id", "conversions.video_id")
        .where("conversions.video_id", videoId)
        .select("conversions.*", "videos.modified_at", "videos.size_bytes")
        .first();
      if (!row) return null;
      return {
        videoId: row.video_id,
        generation: conversionGeneration({
          id: row.video_id,
          modifiedAt: row.modified_at,
          sizeBytes: Number(row.size_bytes),
        }),
        sourceModifiedAt: row.modified_at,
        sourceSizeBytes: Number(row.size_bytes),
        status: row.status,
        progress: Number(row.progress),
        error: row.error,
      };
    },
    async queueConversion(video, generation) {
      return database.transaction(async (transaction) => {
        const current = await transaction("videos")
          .where({ id: video.id, modified_at: video.modifiedAt, size_bytes: video.sizeBytes })
          .first("id");
        if (!current) return null;
        const row: ConversionRow = {
          video_id: video.id,
          status: "queued",
          progress: 0,
          error: null,
        };
        await transaction("conversions").insert(row).onConflict("video_id").merge();
        return {
          videoId: video.id,
          generation,
          sourceModifiedAt: video.modifiedAt,
          sourceSizeBytes: video.sizeBytes,
          status: "queued",
          progress: 0,
          error: null,
        };
      });
    },
    markConverting: (record) => updateConversion(record, { status: "converting", error: null }),
    updateProgress: (record, progress) => updateConversion(record, { progress }),
    markReady: (record) =>
      updateConversion(record, { status: "ready", progress: 100, error: null }),
    markFailed: (record, error) => updateConversion(record, { status: "failed", error }),
    async listPendingVideoIds() {
      const rows = await database<ConversionRow>("conversions")
        .whereIn("status", ["queued", "converting"])
        .select("video_id");
      return rows.map((row) => row.video_id);
    },
  };
}
