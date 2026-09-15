import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

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
  const manager = createConversionManager({
    repository: createConversionRepository(database.connection),
    library,
    configuration,
    logger: createLogger(),
    executor,
  });
  return { configuration, database, library, manager };
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
});
