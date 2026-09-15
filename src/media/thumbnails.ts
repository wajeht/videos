import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import type { Configuration } from "../config.js";
import { hasErrorCode } from "../errors.js";
import { logCause, type Logger } from "../logger.js";
import { ffmpegExecutable } from "./executables.js";
import { mapLimit } from "./map-limit.js";
import { resolveContainedPath } from "./path.js";
import type { VideoRecord } from "./types.js";

const execFileAsync = promisify(execFile);
const thumbnailConcurrency = 2;
const videoIdPattern = /^[a-f0-9]{24}$/;

export const thumbnailCacheVersion = 3;

export function thumbnailsDirectory(dataDirectory: string): string {
  return path.join(dataDirectory, "thumbnails");
}

const thumbnailMetaSchema = z.object({
  modifiedAt: z.iso.datetime(),
  sizeBytes: z.number().int().nonnegative(),
  version: z.literal(thumbnailCacheVersion),
  revision: z.number().int().nonnegative(),
  chapterStarts: z
    .array(z.number().int().nonnegative())
    .refine((starts) => starts.every((start, index) => index === 0 || start > starts[index - 1]!)),
});

export type ThumbnailMeta = z.infer<typeof thumbnailMetaSchema>;

export type ThumbnailGenerator = (
  sourceVideo: string,
  destination: string,
  seekSeconds: number,
) => Promise<void>;

export interface ThumbnailChapter {
  videoId: string;
  startSeconds: number;
  sortOrder: number;
}

export interface ThumbnailIndex {
  revisions: Map<string, number>;
  chapterStartsByVideo: Map<string, number[]>;
}

export type ThumbnailRegenerationStatus =
  | { status: "idle" | "running" }
  | { status: "complete"; revision: number }
  | { status: "failed"; message: string };

export interface ThumbnailCache {
  listThumbnailIndex(): Promise<ThumbnailIndex>;
  synchronize(videos: VideoRecord[], chapters: ThumbnailChapter[]): Promise<void>;
  regenerate(video: VideoRecord, chapters: ThumbnailChapter[]): Promise<number>;
  startRegeneration(video: VideoRecord, chapters: ThumbnailChapter[]): ThumbnailRegenerationStatus;
  regenerationStatus(videoId: string): ThumbnailRegenerationStatus;
}

export function thumbnailSeekSeconds(durationSeconds: number): number {
  if (durationSeconds <= 2) return 0;
  if (durationSeconds < 40) return Math.round(durationSeconds * 30) / 100;
  return Math.min(90, Math.max(25, Math.round(durationSeconds * 0.12)));
}

export function chapterThumbnailSeeks(chapters: ThumbnailChapter[]): Map<string, number> {
  const grouped = new Map<string, ThumbnailChapter[]>();
  for (const chapter of chapters) {
    const list = grouped.get(chapter.videoId) ?? [];
    list.push(chapter);
    grouped.set(chapter.videoId, list);
  }
  const seeks = new Map<string, number>();
  for (const [videoId, list] of grouped) {
    list.sort((left, right) => left.sortOrder - right.sortOrder);
    const afterIntro = list.find((chapter) => chapter.startSeconds >= 20) ?? list[1];
    if (afterIntro && afterIntro.startSeconds > 0) seeks.set(videoId, afterIntro.startSeconds);
  }
  return seeks;
}

export function chapterThumbnailSeekSeconds(
  chapterStarts: number[],
  index: number,
  durationSeconds: number,
): number {
  const start = chapterStarts[index] ?? 0;
  const end = chapterStarts[index + 1] ?? durationSeconds;
  const offset = Math.min(2, Math.max(0, end - start) / 2);
  return Math.min(start + offset, Math.max(0, durationSeconds - 1));
}

function videoThumbnailDirectory(directory: string, videoId: string): string {
  return path.join(directory, videoId);
}

function revisionDirectory(directory: string, videoId: string, revision: number): string {
  return path.join(videoThumbnailDirectory(directory, videoId), String(revision));
}

export function thumbnailRelativePath(videoId: string, revision: number): string {
  return path.join(videoId, String(revision), "poster.jpg");
}

export function thumbnailPath(directory: string, videoId: string, revision: number): string {
  return path.join(directory, thumbnailRelativePath(videoId, revision));
}

export function chapterThumbnailRelativePath(
  videoId: string,
  revision: number,
  startSeconds: number,
): string {
  return path.join(videoId, String(revision), `chapter-${startSeconds}.jpg`);
}

export function chapterThumbnailPath(
  directory: string,
  videoId: string,
  revision: number,
  startSeconds: number,
): string {
  return path.join(directory, chapterThumbnailRelativePath(videoId, revision, startSeconds));
}

export async function generateThumbnail(
  sourceVideo: string,
  destination: string,
  seekSeconds: number,
): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await execFileAsync(
    ffmpegExecutable,
    [
      "-v",
      "error",
      "-ss",
      String(seekSeconds),
      "-i",
      sourceVideo,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-q:v",
      "3",
      "-an",
      "-y",
      destination,
    ],
    { timeout: 60_000 },
  );
}

export function createThumbnailCache({
  configuration,
  logger,
  generate = generateThumbnail,
}: {
  configuration: Configuration;
  logger: Logger;
  generate?: ThumbnailGenerator;
}): ThumbnailCache {
  const directory = thumbnailsDirectory(configuration.media.dataDirectory);
  const metas = new Map<string, ThumbnailMeta>();
  const locks = new Map<string, Promise<unknown>>();
  const jobs = new Map<string, ThumbnailRegenerationStatus>();
  let loaded = false;
  let loading: Promise<void> | null = null;

  function metaPath(videoId: string): string {
    return path.join(videoThumbnailDirectory(directory, videoId), "current.json");
  }

  async function readMeta(videoId: string): Promise<ThumbnailMeta | null> {
    try {
      const parsed = thumbnailMetaSchema.safeParse(
        JSON.parse(await fs.readFile(metaPath(videoId), "utf8")),
      );
      return parsed.success ? parsed.data : null;
    } catch (error) {
      if (hasErrorCode(error, "ENOENT") || error instanceof SyntaxError) {
        return null;
      }
      throw error;
    }
  }

  function chaptersByVideo(chapters: ThumbnailChapter[]): Map<string, number[]> {
    const starts = new Map<string, number[]>();
    for (const chapter of chapters) {
      const list = starts.get(chapter.videoId) ?? [];
      list.push(chapter.startSeconds);
      starts.set(chapter.videoId, list);
    }
    for (const [videoId, list] of starts) {
      starts.set(
        videoId,
        [...new Set(list)].sort((left, right) => left - right),
      );
    }
    return starts;
  }

  async function hasCompleteRevision(videoId: string, meta: ThumbnailMeta): Promise<boolean> {
    try {
      await Promise.all([
        fs.access(thumbnailPath(directory, videoId, meta.revision)),
        ...meta.chapterStarts.map((startSeconds) =>
          fs.access(chapterThumbnailPath(directory, videoId, meta.revision, startSeconds)),
        ),
      ]);
      return true;
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return false;
      throw error;
    }
  }

  async function loadIndex(): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) {
        loaded = true;
        return;
      }
      throw error;
    }
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && videoIdPattern.test(entry.name))
        .map(async (entry) => {
          const meta = await readMeta(entry.name);
          if (meta && (await hasCompleteRevision(entry.name, meta))) metas.set(entry.name, meta);
        }),
    );
    loaded = true;
  }

  async function ensureIndex(): Promise<void> {
    if (loaded) return;
    loading ??= loadIndex().finally(() => {
      loading = null;
    });
    await loading;
  }

  function snapshot(): ThumbnailIndex {
    return {
      revisions: new Map([...metas].map(([videoId, meta]) => [videoId, meta.revision])),
      chapterStartsByVideo: new Map(
        [...metas].map(([videoId, meta]) => [videoId, [...meta.chapterStarts]]),
      ),
    };
  }

  async function isCurrent(video: VideoRecord, chapterStarts: number[]): Promise<boolean> {
    const meta = metas.get(video.id);
    return (
      meta !== undefined &&
      meta.modifiedAt === video.modifiedAt &&
      meta.sizeBytes === video.sizeBytes &&
      sameNumberList(meta.chapterStarts, chapterStarts) &&
      (await hasCompleteRevision(video.id, meta))
    );
  }

  async function removeVideoThumbnails(videoId: string): Promise<void> {
    await fs.rm(videoThumbnailDirectory(directory, videoId), { recursive: true, force: true });
    metas.delete(videoId);
    jobs.delete(videoId);
  }

  async function storedVideoIds(): Promise<Set<string>> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const ids = new Set<string>();
      for (const entry of entries) {
        if (entry.isDirectory() && videoIdPattern.test(entry.name)) ids.add(entry.name);
      }
      return ids;
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return new Set();
      throw error;
    }
  }

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

  async function cleanupRevisions(
    videoId: string,
    currentRevision: number,
    previousRevision: number | undefined,
  ): Promise<void> {
    try {
      const entries = await fs.readdir(videoThumbnailDirectory(directory, videoId), {
        withFileTypes: true,
      });
      const retained = new Set([currentRevision, previousRevision]);
      await Promise.all(
        entries
          .filter(
            (entry) =>
              entry.isDirectory() && /^\d+$/.test(entry.name) && !retained.has(Number(entry.name)),
          )
          .map((entry) =>
            fs.rm(path.join(videoThumbnailDirectory(directory, videoId), entry.name), {
              recursive: true,
              force: true,
            }),
          ),
      );
    } catch (error) {
      logger.warn("Could not prune old thumbnail revisions", {
        videoId,
        error: logCause(error),
      });
    }
  }

  async function writeVideoThumbnails(
    video: VideoRecord,
    chapterStarts: number[],
    chapterSeeks: Map<string, number>,
  ): Promise<number> {
    const source = await resolveContainedPath(configuration.media.videosDirectory, video.path);
    const videoDirectory = videoThumbnailDirectory(directory, video.id);
    const stagingDirectory = path.join(videoDirectory, `.staging-${randomUUID()}`);
    const previousRevision = metas.get(video.id)?.revision;
    const revision = Math.max(Date.now(), (previousRevision ?? 0) + 1);
    const publishedDirectory = revisionDirectory(directory, video.id, revision);
    const temporaryMeta = path.join(videoDirectory, `.current-${randomUUID()}.json`);
    let published = false;
    await fs.mkdir(stagingDirectory, { recursive: true });
    try {
      const seekSeconds = Math.min(
        chapterSeeks.get(video.id) ?? thumbnailSeekSeconds(video.durationSeconds),
        Math.max(0, video.durationSeconds - 1),
      );
      await generate(source, path.join(stagingDirectory, "poster.jpg"), seekSeconds);
      for (const [index, startSeconds] of chapterStarts.entries()) {
        await generate(
          source,
          path.join(stagingDirectory, `chapter-${startSeconds}.jpg`),
          chapterThumbnailSeekSeconds(chapterStarts, index, video.durationSeconds),
        );
      }
      await fs.rename(stagingDirectory, publishedDirectory);
      published = true;
      const meta: ThumbnailMeta = {
        modifiedAt: video.modifiedAt,
        sizeBytes: video.sizeBytes,
        version: thumbnailCacheVersion,
        revision,
        chapterStarts,
      };
      await fs.writeFile(temporaryMeta, JSON.stringify(meta));
      await fs.rename(temporaryMeta, metaPath(video.id));
      metas.set(video.id, meta);
      await cleanupRevisions(video.id, revision, previousRevision);
      return revision;
    } catch (error) {
      if (published) await fs.rm(publishedDirectory, { recursive: true, force: true });
      throw error;
    } finally {
      await Promise.all([
        fs.rm(stagingDirectory, { recursive: true, force: true }),
        fs.rm(temporaryMeta, { force: true }),
      ]);
    }
  }

  async function regenerate(video: VideoRecord, chapters: ThumbnailChapter[]): Promise<number> {
    await ensureIndex();
    const starts = chaptersByVideo(chapters).get(video.id) ?? [];
    return withVideoLock(video.id, () =>
      writeVideoThumbnails(video, starts, chapterThumbnailSeeks(chapters)),
    );
  }

  return {
    async listThumbnailIndex() {
      await ensureIndex();
      return snapshot();
    },

    async synchronize(videos, chapters) {
      await fs.mkdir(directory, { recursive: true });
      await ensureIndex();
      const retained = new Set(videos.map((video) => video.id));
      const stored = await storedVideoIds();
      await Promise.all(
        [...stored]
          .filter((videoId) => !retained.has(videoId))
          .map((videoId) => withVideoLock(videoId, () => removeVideoThumbnails(videoId))),
      );

      const startsByVideo = chaptersByVideo(chapters);
      const chapterSeeks = chapterThumbnailSeeks(chapters);
      await mapLimit(videos, thumbnailConcurrency, async (video) => {
        try {
          await withVideoLock(video.id, async () => {
            const starts = startsByVideo.get(video.id) ?? [];
            if (await isCurrent(video, starts)) return;
            await writeVideoThumbnails(video, starts, chapterSeeks);
          });
        } catch (error) {
          logger.warn("Could not generate thumbnail", {
            videoId: video.id,
            path: video.path,
            error: logCause(error),
          });
        }
      });
    },

    regenerate,

    startRegeneration(video, chapters) {
      const current = jobs.get(video.id);
      if (current?.status === "running") return current;
      jobs.set(video.id, { status: "running" });
      void regenerate(video, chapters).then(
        (revision) => jobs.set(video.id, { status: "complete", revision }),
        (error) => {
          logger.warn("Could not regenerate thumbnail", {
            videoId: video.id,
            path: video.path,
            error: logCause(error),
          });
          jobs.set(video.id, { status: "failed", message: "Could not regenerate thumbnails" });
        },
      );
      return { status: "running" };
    },

    regenerationStatus(videoId) {
      return jobs.get(videoId) ?? { status: "idle" };
    },
  };
}

function sameNumberList(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
