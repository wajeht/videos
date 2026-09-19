import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createConfiguration } from "../config.js";
import type { Database } from "../db/db.js";
import { createLibraryRepository } from "./library.repository.js";
import { createLogger } from "../logger.js";
import { createTemporaryDirectory, createTestDatabase } from "../test/resources.js";
import {
  conversionPlaylistFilename,
  createConversionManager,
  hlsDirectory,
  planConversion,
  type ConversionExecutor,
} from "./conversion.js";
import { createConversionRepository } from "./conversion.repository.js";
import { createPlaybackService } from "../playback/playback.service.js";
import { conversionGeneration } from "./conversion-source.js";
import { createScanner } from "./scanner.js";
import type { VideoRecord } from "./types.js";

async function createFixture(executor: ConversionExecutor) {
  const directory = await createTemporaryDirectory("video-conversion-");
  const dataDirectory = path.join(directory, "data");
  const videosDirectory = path.join(directory, "videos");
  await Promise.all([
    fs.mkdir(dataDirectory, { recursive: true }),
    fs.mkdir(videosDirectory, { recursive: true }),
  ]);
  const configuration = createConfiguration({
    APP_ENV: "testing",
    DATA_DIR: dataDirectory,
    VIDEOS_DIR: videosDirectory,
  });
  const database = await createTestDatabase(configuration);
  const now = new Date().toISOString();
  await database.connection("playlists").insert({
    id: "a".repeat(24),
    path: "playlist",
    title: "Playlist",
    description: "",
    sort_order: 0,
  });
  for (const [index, id] of ["b".repeat(24), "c".repeat(24)].entries()) {
    await database.connection("videos").insert({
      id,
      playlist_id: "a".repeat(24),
      path: `playlist/${index}.mkv`,
      title: `Video ${index}`,
      sort_order: index,
      duration_seconds: 100,
      size_bytes: 100,
      container: "mkv",
      video_codec: "hevc",
      audio_codec: "aac",
      browser_compatible: false,
      modified_at: now,
    });
  }
  const library = createLibraryRepository(database.connection);
  const repository = createConversionRepository(database.connection);
  const manager = createConversionManager({
    repository,
    library,
    configuration,
    logger: createLogger(),
    executor,
  });
  return {
    configuration,
    database,
    library,
    manager,
    repository,
    playback: createPlaybackService(library, manager),
  };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function writePlaylist(
  fixture: Fixture,
  videoId: string,
  generation: string,
): Promise<string> {
  const filename = path.join(
    hlsDirectory(fixture.configuration.media.dataDirectory),
    videoId,
    generation,
    conversionPlaylistFilename,
  );
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, "#EXTM3U");
  return filename;
}

async function synchronizeVideos(fixture: Fixture, videos: VideoRecord[]): Promise<void> {
  await fixture.library.synchronizeLibrary({
    playlists: await fixture.library.getPlaylists(),
    playlistSections: [],
    videos,
    authors: [],
    playlistAuthors: [],
    videoAuthors: [],
    chapters: [],
    skippedVideoIds: [],
  });
}

async function replaceVideo(fixture: Fixture, video: VideoRecord): Promise<VideoRecord> {
  const replacement = {
    ...video,
    sizeBytes: video.sizeBytes + 1,
    modifiedAt: new Date(Date.parse(video.modifiedAt) + 1000).toISOString(),
  };
  await synchronizeVideos(
    fixture,
    (await fixture.library.getVideos()).map((entry) =>
      entry.id === video.id ? replacement : entry,
    ),
  );
  return replacement;
}

async function waitForStatus(database: Database, videoId: string, status: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const row = await database.connection("conversions").where({ video_id: videoId }).first();
    if (row?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Conversion did not reach ${status}`);
}

describe("conversion plan", () => {
  it.each([
    {
      name: "copies H.264 video and AAC audio",
      videoCodec: "h264",
      audioCodec: "aac",
      expected: { videoCodec: "copy", audioCodec: "copy" },
    },
    {
      name: "copies video when no audio stream exists",
      videoCodec: "h264",
      audioCodec: null,
      expected: { videoCodec: "copy", audioCodec: "copy" },
    },
    {
      name: "copies H.264 video while converting incompatible audio",
      videoCodec: "h264",
      audioCodec: "opus",
      expected: { videoCodec: "copy", audioCodec: "aac" },
    },
    {
      name: "converts incompatible video while copying AAC audio",
      videoCodec: "hevc",
      audioCodec: "aac",
      expected: { videoCodec: "h264_qsv", audioCodec: "copy" },
    },
    {
      name: "converts both incompatible streams",
      videoCodec: "hevc",
      audioCodec: "opus",
      expected: { videoCodec: "h264_qsv", audioCodec: "aac" },
    },
  ])("$name", ({ videoCodec, audioCodec, expected }) => {
    expect(planConversion({ videoCodec, audioCodec })).toEqual(expected);
  });
});

describe("conversion manager", () => {
  it("deduplicates jobs and runs only one conversion at a time", async () => {
    let active = 0;
    let maximumActive = 0;
    let calls = 0;
    const { database, library, manager } = await createFixture(async () => {
      calls++;
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
    });
    const first = (await library.getVideo("b".repeat(24)))!;
    const second = (await library.getVideo("c".repeat(24)))!;

    await Promise.all([
      manager.requestConversion(first),
      manager.requestConversion(first),
      manager.requestConversion(second),
    ]);
    await waitForStatus(database, first.id, "ready");
    await waitForStatus(database, second.id, "ready");

    expect(calls).toBe(2);
    expect(maximumActive).toBe(1);
  });

  it("records failures for an explicit retry", async () => {
    const { database, library, manager } = await createFixture(async () => {
      throw new Error("Quick Sync unavailable");
    });
    const video = (await library.getVideo("b".repeat(24)))!;
    await manager.requestConversion(video);
    await waitForStatus(database, video.id, "failed");
    expect(await manager.getConversion(video.id)).toMatchObject({
      status: "failed",
      error: "Quick Sync unavailable",
    });
  });

  it("rebuilds a ready conversion when only a legacy cache playlist exists", async () => {
    let calls = 0;
    const { configuration, database, library, manager } = await createFixture(async () => {
      calls++;
    });
    const video = (await library.getVideo("b".repeat(24)))!;

    await manager.requestConversion(video);
    await waitForStatus(database, video.id, "ready");
    const outputDirectory = path.join(hlsDirectory(configuration.media.dataDirectory), video.id);
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(path.join(outputDirectory, "index.m3u8"), "legacy cache");
    await manager.requestConversion(video);
    await waitForStatus(database, video.id, "ready");

    expect(calls).toBe(2);
    expect(conversionPlaylistFilename).toBe("index-v2.m3u8");
  });

  it("does not serve a stale playlist while a replacement waits in the queue", async () => {
    const started = deferred();
    const finish = deferred();
    const calls: VideoRecord[] = [];
    const fixture = await createFixture(async (video) => {
      calls.push(video);
      if (video.id === "c".repeat(24)) {
        started.resolve();
        await finish.promise;
      }
    });
    const first = (await fixture.library.getVideo("b".repeat(24)))!;
    const second = (await fixture.library.getVideo("c".repeat(24)))!;
    const old = (await fixture.repository.queueConversion(first, conversionGeneration(first)))!;
    await fixture.repository.markReady(old);
    const oldPlaylist = await writePlaylist(fixture, first.id, old.generation);
    await fixture.manager.requestConversion(second);
    await started.promise;
    try {
      const replacement = await replaceVideo(fixture, first);
      expect(await fixture.playback.preparePlayback(first.id)).toEqual({
        kind: "converting",
        status: "queued",
        progress: 0,
      });
      expect((await fixture.manager.getConversion(first.id))?.generation).toBe(
        conversionGeneration(replacement),
      );
      expect(conversionGeneration(replacement)).not.toBe(old.generation);
      await expect(fs.access(oldPlaylist)).resolves.toBeUndefined();
    } finally {
      finish.resolve();
    }
    await waitForStatus(fixture.database, first.id, "ready");
    expect(calls.map((video) => [video.id, video.sizeBytes])).toEqual([
      [second.id, 100],
      [first.id, 101],
    ]);
  });

  it("skips a source that was replaced before its queued job started", async () => {
    const started = deferred();
    const finish = deferred();
    const calls: VideoRecord[] = [];
    const fixture = await createFixture(async (video) => {
      calls.push(video);
      if (video.id === "c".repeat(24)) {
        started.resolve();
        await finish.promise;
      }
    });
    const first = (await fixture.library.getVideo("b".repeat(24)))!;
    const second = (await fixture.library.getVideo("c".repeat(24)))!;
    await fixture.manager.requestConversion(second);
    await started.promise;
    try {
      await fixture.manager.requestConversion(first);
      await replaceVideo(fixture, first);
      await fixture.playback.preparePlayback(first.id);
    } finally {
      finish.resolve();
    }
    await waitForStatus(fixture.database, first.id, "ready");
    expect(calls.map((video) => [video.id, video.sizeBytes])).toEqual([
      [second.id, 100],
      [first.id, 101],
    ]);
  });

  it("ignores progress and completion from a replaced running source", async () => {
    const started = deferred();
    const finish = deferred();
    const calls: VideoRecord[] = [];
    let oldProgress!: (progress: number) => Promise<void>;
    const fixture = await createFixture(async (video, onProgress) => {
      calls.push(video);
      if (video.sizeBytes === 100) {
        oldProgress = onProgress;
        started.resolve();
        await finish.promise;
      }
    });
    const video = (await fixture.library.getVideo("b".repeat(24)))!;
    const old = (await fixture.manager.requestConversion(video))!;
    await started.promise;
    try {
      const replacement = await replaceVideo(fixture, video);
      const next = (await fixture.manager.requestConversion(replacement))!;
      await oldProgress(80);
      await fixture.repository.markReady(old);
      await fixture.repository.markFailed(old, "old failure");
      expect(await fixture.manager.getConversion(video.id)).toMatchObject({
        generation: next.generation,
        status: "queued",
        progress: 0,
        error: null,
      });
    } finally {
      finish.resolve();
    }
    await waitForStatus(fixture.database, video.id, "ready");
    expect(calls.map((entry) => entry.sizeBytes)).toEqual([100, 101]);
  });

  it.each(["removed", "renamed"])(
    "prunes %s video caches while retaining a current generation",
    async (change) => {
      const fixture = await createFixture(async () => {});
      const first = (await fixture.library.getVideo("b".repeat(24)))!;
      const second = (await fixture.library.getVideo("c".repeat(24)))!;
      const firstRecord = (await fixture.repository.queueConversion(
        first,
        conversionGeneration(first),
      ))!;
      const secondRecord = (await fixture.repository.queueConversion(
        second,
        conversionGeneration(second),
      ))!;
      await fixture.repository.markReady(firstRecord);
      await fixture.repository.markReady(secondRecord);
      const oldPlaylist = await writePlaylist(fixture, first.id, firstRecord.generation);
      const retainedPlaylist = await writePlaylist(fixture, second.id, secondRecord.generation);
      const videos = [second];
      if (change === "renamed")
        videos.push({ ...first, id: "d".repeat(24), path: "playlist/renamed.mkv" });
      await synchronizeVideos(fixture, videos);
      await fixture.manager.synchronize();
      await expect(fs.access(oldPlaylist)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(fs.readFile(retainedPlaylist, "utf8")).resolves.toBe("#EXTM3U");
    },
  );

  it.each([true, false])(
    "retains active output and prunes after completion (output exists: %s)",
    async (writeBeforeScan) => {
      const started = deferred();
      const finish = deferred();
      let filename = "";
      const fixture = await createFixture(async (video, _onProgress, generation) => {
        if (writeBeforeScan) filename = await writePlaylist(fixture, video.id, generation);
        started.resolve();
        await finish.promise;
        if (!writeBeforeScan) filename = await writePlaylist(fixture, video.id, generation);
      });
      const video = (await fixture.library.getVideo("b".repeat(24)))!;
      const record = (await fixture.manager.requestConversion(video))!;
      await started.promise;
      try {
        await synchronizeVideos(
          fixture,
          (await fixture.library.getVideos()).filter((entry) => entry.id !== video.id),
        );
        await fixture.manager.synchronize();
        await expect(
          fs.access(record.playlistPath).then(
            () => true,
            () => false,
          ),
        ).resolves.toBe(writeBeforeScan);
      } finally {
        finish.resolve();
      }
      await vi.waitFor(async () => {
        expect(filename).not.toBe("");
        await expect(fs.access(filename)).rejects.toMatchObject({ code: "ENOENT" });
      });
    },
  );

  it("only prunes caches after a successful scan", async () => {
    const fixture = await createFixture(async () => {});
    const filename = await writePlaylist(fixture, "d".repeat(24), "e".repeat(24));
    const scanner = createScanner({
      configuration: fixture.configuration,
      repository: fixture.library,
      logger: createLogger(),
      conversions: fixture.manager,
    });
    const source = fixture.configuration.media.videosDirectory;
    await fs.rename(source, `${source}-offline`);
    expect((await scanner.scanLibrary()).status).toBe("failed");
    await expect(fs.access(filename)).resolves.toBeUndefined();
    await fs.rename(`${source}-offline`, source);
    expect((await scanner.scanLibrary()).status).toBe("complete");
    await expect(fs.access(filename)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recovers interrupted conversions using the same source generation", async () => {
    const fixture = await createFixture(async () => {});
    const video = (await fixture.library.getVideo("b".repeat(24)))!;
    const record = (await fixture.repository.queueConversion(video, conversionGeneration(video)))!;
    await fixture.repository.markConverting(record);
    const executor = vi.fn(async () => {});
    const recovered = createConversionManager({
      repository: fixture.repository,
      library: fixture.library,
      configuration: fixture.configuration,
      logger: createLogger(),
      executor,
    });
    await recovered.recoverConversions();
    await waitForStatus(fixture.database, video.id, "ready");
    expect(executor).toHaveBeenCalledWith(video, expect.any(Function), record.generation);
    expect((await recovered.getConversion(video.id))?.generation).toBe(record.generation);
  });
});
