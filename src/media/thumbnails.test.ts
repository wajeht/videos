import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createConfiguration } from "../config.js";
import { createLogger } from "../logger.js";
import { createTemporaryDirectory } from "../test/resources.js";
import {
  chapterThumbnailPath,
  chapterThumbnailSeekSeconds,
  chapterThumbnailSeeks,
  createThumbnailCache,
  thumbnailPath,
  thumbnailSeekSeconds,
  thumbnailsDirectory,
  type ThumbnailGenerator,
} from "./thumbnails.js";
import type { VideoRecord } from "./types.js";

const videoA = "a".repeat(24);
const videoB = "b".repeat(24);

function videoRecord(id: string, filename: string): VideoRecord {
  return {
    id,
    path: filename,
    playlistId: null,
    playlistSectionId: null,
    title: filename,
    description: "",
    tags: [],
    sourceProvider: null,
    sourceUrl: null,
    sortOrder: 0,
    durationSeconds: 60,
    sizeBytes: 100,
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    browserCompatible: true,
    modifiedAt: "2026-08-21T00:00:00.000Z",
  };
}

async function createCache(generate?: ThumbnailGenerator) {
  const directory = await createTemporaryDirectory("video-thumbnails-");
  const videosDirectory = path.join(directory, "videos");
  const dataDirectory = path.join(directory, "data");
  await Promise.all([
    fs.mkdir(videosDirectory, { recursive: true }),
    fs.mkdir(dataDirectory, { recursive: true }),
  ]);
  await fs.writeFile(path.join(videosDirectory, "A.mp4"), "video-a");
  await fs.writeFile(path.join(videosDirectory, "B.mp4"), "video-b");
  const configuration = createConfiguration({
    APP_ENV: "testing",
    VIDEOS_DIR: videosDirectory,
    DATA_DIR: dataDirectory,
  });
  const logger = createLogger();
  const warn = vi.spyOn(logger, "warn");
  const cache = createThumbnailCache({
    configuration,
    logger,
    generate:
      generate ??
      (async (_source, destination) => {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, "thumb");
      }),
  });
  return { cache, configuration, warn };
}

describe("thumbnails", () => {
  it("seeks past short intros, using a later chapter when available", () => {
    expect(thumbnailSeekSeconds(0.5)).toBe(0);
    expect(thumbnailSeekSeconds(20)).toBe(6);
    expect(thumbnailSeekSeconds(60)).toBe(25);
    expect(thumbnailSeekSeconds(2500)).toBe(90);
    expect(
      chapterThumbnailSeeks([
        { videoId: videoA, startSeconds: 0, sortOrder: 0 },
        { videoId: videoA, startSeconds: 130, sortOrder: 1 },
      ]).get(videoA),
    ).toBe(130);
    expect(chapterThumbnailSeekSeconds([0, 3, 30], 0, 60)).toBe(1.5);
    expect(chapterThumbnailSeekSeconds([0, 3, 30], 1, 60)).toBe(5);
  });

  it("generates posters for every video", async () => {
    const generate = vi.fn<ThumbnailGenerator>(async (_source, destination) => {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, "thumb");
    });
    const { cache, configuration } = await createCache(generate);

    await cache.synchronize([videoRecord(videoA, "A.mp4"), videoRecord(videoB, "B.mp4")], []);

    expect(generate).toHaveBeenCalledTimes(2);
    const thumbnails = await cache.listThumbnailIndex();
    await expect(
      fs.readFile(
        thumbnailPath(
          thumbnailsDirectory(configuration.media.dataDirectory),
          videoA,
          thumbnails.revisions.get(videoA)!,
        ),
        "utf8",
      ),
    ).resolves.toBe("thumb");
    await expect(
      fs.readFile(
        thumbnailPath(
          thumbnailsDirectory(configuration.media.dataDirectory),
          videoB,
          thumbnails.revisions.get(videoB)!,
        ),
        "utf8",
      ),
    ).resolves.toBe("thumb");
    expect(new Set(thumbnails.revisions.keys())).toEqual(new Set([videoA, videoB]));
  });

  it("writes a poster for each chapter start time", async () => {
    const generate = vi.fn<ThumbnailGenerator>(async (_source, destination) => {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, path.basename(destination));
    });
    const { cache, configuration } = await createCache(generate);

    await cache.synchronize(
      [videoRecord(videoA, "A.mp4")],
      [
        { videoId: videoA, startSeconds: 0, sortOrder: 0 },
        { videoId: videoA, startSeconds: 130, sortOrder: 1 },
      ],
    );

    const index = await cache.listThumbnailIndex();
    expect(index.chapterStartsByVideo).toEqual(new Map([[videoA, [0, 130]]]));
    await expect(
      fs.readFile(
        chapterThumbnailPath(
          thumbnailsDirectory(configuration.media.dataDirectory),
          videoA,
          index.revisions.get(videoA)!,
          130,
        ),
        "utf8",
      ),
    ).resolves.toBe("chapter-130.jpg");
  });

  it("reuses a current thumbnail and regenerates when the source changes", async () => {
    const generate = vi.fn<ThumbnailGenerator>(async (_source, destination) => {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, `thumb-${generate.mock.calls.length}`);
    });
    const { cache } = await createCache(generate);
    const video = videoRecord(videoA, "A.mp4");

    await cache.synchronize([video], []);
    await cache.synchronize([video], []);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[2]).toBe(25);

    await cache.synchronize([{ ...video, sizeBytes: 200 }], []);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("restores a missing chapter thumbnail", async () => {
    const generate = vi.fn<ThumbnailGenerator>(async (_source, destination) => {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, "thumb");
    });
    const { cache, configuration } = await createCache(generate);
    const video = videoRecord(videoA, "A.mp4");
    const chapters = [{ videoId: videoA, startSeconds: 30, sortOrder: 0 }];
    await cache.synchronize([video], chapters);
    const firstIndex = await cache.listThumbnailIndex();
    const chapterPath = chapterThumbnailPath(
      thumbnailsDirectory(configuration.media.dataDirectory),
      videoA,
      firstIndex.revisions.get(videoA)!,
      30,
    );
    await fs.rm(chapterPath);
    await cache.synchronize([video], chapters);

    expect(generate).toHaveBeenCalledTimes(4);
    const secondIndex = await cache.listThumbnailIndex();
    await expect(
      fs.access(
        chapterThumbnailPath(
          thumbnailsDirectory(configuration.media.dataDirectory),
          videoA,
          secondIndex.revisions.get(videoA)!,
          30,
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it("forces regeneration of the poster and all chapter thumbnails", async () => {
    const generate = vi.fn<ThumbnailGenerator>(async (_source, destination) => {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, `thumb-${generate.mock.calls.length}`);
    });
    const { cache } = await createCache(generate);
    const video = videoRecord(videoA, "A.mp4");
    const chapters = [{ videoId: videoA, startSeconds: 30, sortOrder: 0 }];

    await cache.synchronize([video], chapters);
    const before = await cache.listThumbnailIndex();
    const revision = await cache.regenerate(video, [
      ...chapters,
      { videoId: videoA, startSeconds: 45, sortOrder: 1 },
    ]);
    const after = await cache.listThumbnailIndex();

    expect(generate).toHaveBeenCalledTimes(5);
    expect(after.revisions.get(videoA)).toBe(revision);
    expect(after.chapterStartsByVideo.get(videoA)).toEqual([30, 45]);
    expect(before.revisions.get(videoA)).toBeLessThan(revision);
    expect(before.chapterStartsByVideo.get(videoA)).toEqual([30]);
  });

  it("keeps the current revision when replacement generation fails", async () => {
    let replacement = false;
    const generate = vi.fn<ThumbnailGenerator>(async (_source, destination) => {
      if (replacement && path.basename(destination).startsWith("chapter-")) {
        throw new Error("FFmpeg failed");
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, replacement ? "replacement" : "current");
    });
    const { cache, configuration } = await createCache(generate);
    const video = videoRecord(videoA, "A.mp4");
    const chapters = [{ videoId: videoA, startSeconds: 30, sortOrder: 0 }];

    await cache.synchronize([video], chapters);
    const before = await cache.listThumbnailIndex();
    replacement = true;
    await expect(cache.regenerate(video, chapters)).rejects.toThrow("FFmpeg failed");

    const after = await cache.listThumbnailIndex();
    expect(after).toBe(before);
    await expect(
      fs.readFile(
        thumbnailPath(
          thumbnailsDirectory(configuration.media.dataDirectory),
          videoA,
          before.revisions.get(videoA)!,
        ),
        "utf8",
      ),
    ).resolves.toBe("current");
  });

  it("treats malformed metadata as stale", async () => {
    const generate = vi.fn<ThumbnailGenerator>(async (_source, destination) => {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, "thumb");
    });
    const { configuration } = await createCache();
    await fs.mkdir(path.join(thumbnailsDirectory(configuration.media.dataDirectory), videoA), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(thumbnailsDirectory(configuration.media.dataDirectory), videoA, "current.json"),
      JSON.stringify({ version: 3, chapterStarts: "invalid" }),
    );
    const cache = createThumbnailCache({ configuration, logger: createLogger(), generate });

    await cache.synchronize([videoRecord(videoA, "A.mp4")], []);

    expect(generate).toHaveBeenCalledOnce();
    expect((await cache.listThumbnailIndex()).revisions.has(videoA)).toBe(true);
  });

  it("coalesces regeneration requests and serializes scans for the same video", async () => {
    let finishGeneration: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      finishGeneration = resolve;
    });
    const generate = vi.fn<ThumbnailGenerator>(async (_source, destination) => {
      await blocked;
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, "thumb");
    });
    const { cache } = await createCache(generate);
    const video = videoRecord(videoA, "A.mp4");

    expect(cache.startRegeneration(video, [])).toEqual({ status: "running" });
    expect(cache.startRegeneration(video, [])).toEqual({ status: "running" });
    const synchronization = cache.synchronize([video], []);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    finishGeneration();
    await synchronization;

    await vi.waitFor(() =>
      expect(cache.regenerationStatus(videoA)).toEqual({
        status: "complete",
        revision: expect.any(Number),
      }),
    );
    expect(generate).toHaveBeenCalledOnce();
  });

  it("serves repeated index reads from its in-memory snapshot", async () => {
    const { cache } = await createCache();
    const video = videoRecord(videoA, "A.mp4");
    const empty = await cache.listThumbnailIndex();
    await cache.synchronize([video], []);
    const index = await cache.listThumbnailIndex();
    const readDirectory = vi.spyOn(fs, "readdir");

    await expect(cache.listThumbnailIndex()).resolves.toBe(index);
    expect(readDirectory).not.toHaveBeenCalled();
    readDirectory.mockRestore();
    expect(index.revisions.has(videoA)).toBe(true);
    expect(empty.revisions.size).toBe(0);

    await cache.synchronize([video], []);
    await expect(cache.listThumbnailIndex()).resolves.toBe(index);
  });

  it("prunes thumbnails for videos that left the library", async () => {
    const { cache, configuration } = await createCache();
    await cache.synchronize([videoRecord(videoA, "A.mp4"), videoRecord(videoB, "B.mp4")], []);
    const before = await cache.listThumbnailIndex();
    await cache.synchronize([videoRecord(videoA, "A.mp4")], []);

    const thumbnails = await cache.listThumbnailIndex();
    expect(new Set(thumbnails.revisions.keys())).toEqual(new Set([videoA]));
    expect(thumbnails.chapterStartsByVideo.has(videoB)).toBe(false);
    expect(before.revisions.has(videoB)).toBe(true);
    await expect(
      fs.access(
        thumbnailPath(
          thumbnailsDirectory(configuration.media.dataDirectory),
          videoB,
          before.revisions.get(videoB)!,
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("swallows generation failures without failing the scan", async () => {
    const { cache, warn } = await createCache(async () => {
      throw new Error("FFmpeg failed");
    });

    await expect(cache.synchronize([videoRecord(videoA, "A.mp4")], [])).resolves.toBeUndefined();
    await expect(cache.listThumbnailIndex()).resolves.toEqual({
      revisions: new Map(),
      chapterStartsByVideo: new Map(),
    });
    expect(warn).toHaveBeenCalledWith(
      "Could not generate thumbnail",
      expect.objectContaining({ videoId: videoA }),
    );
  });
});
