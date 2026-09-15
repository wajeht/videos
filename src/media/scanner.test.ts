import { seedTestProfile, testProfileId } from "../test/resources.js";
import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createConfiguration } from "../config.js";
import { createLogger } from "../logger.js";
import { createTemporaryDirectory, createTestDatabase } from "../test/resources.js";
import { createLibraryRepository } from "./library.repository.js";
import {
  createPlaylistCoverCache,
  playlistCoverPath,
  playlistCoversDirectory,
} from "./playlist-covers.js";
import type { VideoProbe } from "./probe.js";
import { createScanner } from "./scanner.js";
import { createThumbnailCache, thumbnailPath, thumbnailsDirectory } from "./thumbnails.js";

const monitorStops: Array<() => void> = [];

afterEach(() => {
  for (const stopMonitoring of monitorStops.splice(0)) stopMonitoring();
});

async function createScannerDirectories(): Promise<{ root: string; dataDirectory: string }> {
  const [root, dataDirectory] = await Promise.all([
    createTemporaryDirectory("video-scanner-"),
    createTemporaryDirectory("video-scanner-data-"),
  ]);
  return { root, dataDirectory };
}

function probeResult(sizeBytes = 100): VideoProbe {
  return {
    durationSeconds: 60,
    sizeBytes,
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    browserCompatible: true,
  };
}

describe("media scanner", () => {
  it("indexes standalone videos and filesystem-derived playlists", async () => {
    const { root, dataDirectory } = await createScannerDirectories();
    await fs.writeFile(path.join(root, "01 - Standalone.mp4"), "standalone");
    await fs.writeFile(
      path.join(root, "01 - Standalone.mp4.json"),
      JSON.stringify({
        version: 1,
        title: "Saved Video",
        authors: ["Video Author"],
        tags: ["Archive"],
        source: { provider: "YouTube", url: "https://youtube.com/watch?v=example" },
      }),
    );

    const playlistDirectory = path.join(root, "02 - Playlist");
    const sectionDirectory = path.join(playlistDirectory, "03 - Section");
    await fs.mkdir(path.join(sectionDirectory, "Nested"), { recursive: true });
    await fs.mkdir(path.join(root, "Empty Playlist"));
    await fs.mkdir(path.join(root, "@eaDir", "metadata"), { recursive: true });
    await fs.writeFile(path.join(root, "@eaDir", "metadata", "ignored.mp4"), "ignored");
    await fs.writeFile(
      path.join(playlistDirectory, "playlist.json"),
      JSON.stringify({
        version: 1,
        title: "Saved Collection",
        authors: ["Playlist Author"],
        tags: ["Instructional"],
      }),
    );
    await fs.writeFile(path.join(playlistDirectory, "10 - Finish.mp4"), "finish");
    await fs.writeFile(path.join(playlistDirectory, "02 - Start.mp4"), "start");
    await fs.writeFile(path.join(sectionDirectory, "01 - Technique.mkv"), "technique");
    await fs.writeFile(path.join(sectionDirectory, "Nested", "ignored.mp4"), "ignored");

    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: root,
      DATA_DIR: dataDirectory,
    });
    const database = await createTestDatabase(configuration);
    await seedTestProfile(database);
    const scanner = createScanner({
      configuration,
      repository: createLibraryRepository(database.connection),
      logger: createLogger(),
      probe: async (filename) => probeResult((await fs.stat(filename)).size),
    });

    const status = await scanner.scanLibrary();
    const playlist = await database.connection("playlists").select().first();
    const videos = await database
      .connection("videos")
      .orderByRaw("playlist_id IS NOT NULL")
      .orderBy("sort_order")
      .select("title", "playlist_id", "playlist_section_id", "tags_json");

    expect(status).toMatchObject({ status: "complete", playlistCount: 1, videoCount: 4 });
    expect(status.warnings).toEqual([
      {
        path: "02 - Playlist/03 - Section/Nested",
        message: "Directories below playlist sections are unsupported",
      },
    ]);
    expect(playlist).toMatchObject({
      title: "Saved Collection",
      tags_json: '["Instructional"]',
    });
    expect(videos).toEqual([
      {
        title: "Saved Video",
        playlist_id: null,
        playlist_section_id: null,
        tags_json: '["Archive"]',
      },
      {
        title: "Start",
        playlist_id: playlist.id,
        playlist_section_id: null,
        tags_json: "[]",
      },
      {
        title: "Finish",
        playlist_id: playlist.id,
        playlist_section_id: null,
        tags_json: "[]",
      },
      {
        title: "Technique",
        playlist_id: playlist.id,
        playlist_section_id: expect.any(String),
        tags_json: "[]",
      },
    ]);
    await expect(database.connection("playlist_sections").pluck("title")).resolves.toEqual([
      "Section",
    ]);
    await expect(database.connection("authors").orderBy("name").pluck("name")).resolves.toEqual([
      "Playlist Author",
      "Video Author",
    ]);
    await expect(
      database.connection("playlist_authors").count({ count: "author_id" }).first(),
    ).resolves.toMatchObject({ count: 1 });
    await expect(
      database.connection("video_authors").count({ count: "author_id" }).first(),
    ).resolves.toMatchObject({ count: 1 });
  });

  it("indexes cover.jpg playlists", async () => {
    const { root, dataDirectory } = await createScannerDirectories();
    await fs.writeFile(path.join(root, "Standalone.mp4"), "standalone");
    const playlistDirectory = path.join(root, "Playlist");
    await fs.mkdir(playlistDirectory);
    await fs.writeFile(path.join(playlistDirectory, "poster.png"), "ignored");
    await fs.writeFile(path.join(playlistDirectory, "cover.jpg"), "playlist-cover");
    await fs.writeFile(path.join(playlistDirectory, "01 - Start.mp4"), "start");
    await fs.writeFile(path.join(playlistDirectory, "02 - Finish.mp4"), "finish");

    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: root,
      DATA_DIR: dataDirectory,
    });
    const database = await createTestDatabase(configuration);
    await seedTestProfile(database);
    const scanner = createScanner({
      configuration,
      repository: createLibraryRepository(database.connection),
      logger: createLogger(),
      probe: async (filename) => probeResult((await fs.stat(filename)).size),
    });

    await scanner.scanLibrary();
    const playlist = await database.connection("playlists").select("cover_path").first();
    expect(playlist).toMatchObject({ cover_path: "Playlist/cover.jpg" });
  });

  it("indexes playlist.jpg when cover.jpg is absent", async () => {
    const { root, dataDirectory } = await createScannerDirectories();
    const playlistDirectory = path.join(root, "Playlist");
    await fs.mkdir(playlistDirectory);
    await fs.writeFile(path.join(playlistDirectory, "playlist.jpg"), "playlist-cover");
    await fs.writeFile(path.join(playlistDirectory, "01 - Video.mp4"), "video");

    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: root,
      DATA_DIR: dataDirectory,
    });
    const database = await createTestDatabase(configuration);
    await seedTestProfile(database);
    const scanner = createScanner({
      configuration,
      repository: createLibraryRepository(database.connection),
      logger: createLogger(),
      probe: async (filename) => probeResult((await fs.stat(filename)).size),
    });

    await scanner.scanLibrary();
    await expect(database.connection("playlists").pluck("cover_path")).resolves.toEqual([
      "Playlist/playlist.jpg",
    ]);
  });

  it("generates thumbnails for every video during a scan", async () => {
    const { root, dataDirectory } = await createScannerDirectories();
    await fs.writeFile(path.join(root, "Talk.mp4"), "talk");
    await fs.writeFile(path.join(root, "Talk.jpg"), "cover");
    await fs.writeFile(path.join(root, "Bare.mp4"), "bare");
    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: root,
      DATA_DIR: dataDirectory,
    });
    const database = await createTestDatabase(configuration);
    await seedTestProfile(database);
    const generate = vi.fn(async (_source: string, destination: string) => {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, "generated");
    });
    const thumbnails = createThumbnailCache({
      configuration,
      logger: createLogger(),
      generate,
    });
    const scanner = createScanner({
      configuration,
      repository: createLibraryRepository(database.connection),
      logger: createLogger(),
      probe: async (filename) => probeResult((await fs.stat(filename)).size),
      thumbnails,
    });

    await scanner.scanLibrary();
    const videos = await database.connection("videos").orderBy("title").select("id", "title");
    const bare = videos.find((video: { title: string }) => video.title === "Bare");
    const talk = videos.find((video: { title: string }) => video.title === "Talk");
    const index = await thumbnails.listThumbnailIndex();

    expect(generate).toHaveBeenCalledTimes(2);
    await expect(
      fs.readFile(
        thumbnailPath(
          thumbnailsDirectory(configuration.media.dataDirectory),
          bare.id,
          index.revisions.get(bare.id)!,
        ),
        "utf8",
      ),
    ).resolves.toBe("generated");
    await expect(
      fs.readFile(
        thumbnailPath(
          thumbnailsDirectory(configuration.media.dataDirectory),
          talk.id,
          index.revisions.get(talk.id)!,
        ),
        "utf8",
      ),
    ).resolves.toBe("generated");
  });

  it("generates optimized playlist covers during a scan", async () => {
    const { root, dataDirectory } = await createScannerDirectories();
    const playlistDirectory = path.join(root, "Playlist");
    await fs.mkdir(playlistDirectory);
    await fs.writeFile(path.join(playlistDirectory, "cover.jpg"), "source-cover");
    await fs.writeFile(path.join(playlistDirectory, "Video.mp4"), "video");
    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: root,
      DATA_DIR: dataDirectory,
    });
    const database = await createTestDatabase(configuration);
    await seedTestProfile(database);
    const generate = vi.fn(async (_source: string, destination: string) => {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, "optimized-cover");
    });
    const playlistCovers = createPlaylistCoverCache({
      configuration,
      logger: createLogger(),
      generate,
    });
    const scanner = createScanner({
      configuration,
      repository: createLibraryRepository(database.connection),
      logger: createLogger(),
      probe: async (filename) => probeResult((await fs.stat(filename)).size),
      playlistCovers,
    });

    await scanner.scanLibrary();
    const playlist = await database.connection("playlists").select("id").first();
    const revision = (await playlistCovers.listPlaylistCoverIndex()).revisions.get(playlist.id)!;

    expect(generate).toHaveBeenCalledOnce();
    await expect(
      fs.readFile(
        playlistCoverPath(
          playlistCoversDirectory(configuration.media.dataDirectory),
          playlist.id,
          revision,
        ),
        "utf8",
      ),
    ).resolves.toBe("optimized-cover");
  });

  it("preserves skipped videos and invalidates conversions only when media changes", async () => {
    const { root, dataDirectory } = await createScannerDirectories();
    const playlistDirectory = path.join(root, "Playlist");
    await fs.mkdir(playlistDirectory);
    const stableVideo = path.join(playlistDirectory, "01 - Stable.mp4");
    const convertedVideo = path.join(playlistDirectory, "02 - Converted.mp4");
    const brokenVideo = path.join(playlistDirectory, "03 - Broken.mp4");
    await Promise.all([
      fs.writeFile(stableVideo, "stable"),
      fs.writeFile(convertedVideo, "converted"),
      fs.writeFile(brokenVideo, "broken"),
    ]);
    await fs.writeFile(
      `${stableVideo}.json`,
      JSON.stringify({
        version: 1,
        chapters: [
          { title: "Introduction", startSeconds: 0 },
          { title: "Outside", startSeconds: 70 },
        ],
      }),
    );

    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: root,
      DATA_DIR: dataDirectory,
    });
    const database = await createTestDatabase(configuration);
    await seedTestProfile(database);
    let failStable = false;
    const probeCalls = new Map<string, number>();
    const scanner = createScanner({
      configuration,
      repository: createLibraryRepository(database.connection),
      logger: createLogger(),
      probe: async (filename) => {
        const name = path.basename(filename);
        probeCalls.set(name, (probeCalls.get(name) ?? 0) + 1);
        if (name === "03 - Broken.mp4" || (failStable && name === "01 - Stable.mp4")) {
          throw new Error("File is still copying");
        }
        return probeResult((await fs.stat(filename)).size);
      },
    });

    const firstStatus = await scanner.scanLibrary();
    expect(firstStatus.warnings).toEqual([
      {
        path: "Playlist/01 - Stable.mp4.json",
        message: "Chapter “Outside” starts outside 01 - Stable.mp4",
      },
      { path: "Playlist/03 - Broken.mp4", message: "File is still copying" },
    ]);
    const stable = await database.connection("videos").where({ title: "Stable" }).first();
    const converted = await database.connection("videos").where({ title: "Converted" }).first();
    await database.connection("progress").insert({
      profile_id: testProfileId,
      video_id: stable.id,
      position_seconds: 30,
      completed: false,
      updated_at: new Date().toISOString(),
    });
    await database.connection("conversions").insert({
      video_id: converted.id,
      status: "ready",
      progress: 100,
    });
    const changedAt = new Date(Date.now() + 10_000);
    await fs.utimes(convertedVideo, changedAt, changedAt);
    await fs.utimes(stableVideo, changedAt, changedAt);
    failStable = true;

    await scanner.scanLibrary();

    await expect(
      database.connection("videos").where({ id: stable.id }).first(),
    ).resolves.toBeTruthy();
    await expect(
      database.connection("progress").where({ video_id: stable.id }).first(),
    ).resolves.toMatchObject({ position_seconds: 30 });
    await expect(
      database.connection("conversions").where({ video_id: converted.id }).first(),
    ).resolves.toBeUndefined();
    expect(Object.fromEntries(probeCalls)).toEqual({
      "01 - Stable.mp4": 2,
      "02 - Converted.mp4": 2,
      "03 - Broken.mp4": 2,
    });
  });

  it("incrementally reconciles playlist and standalone sidecar changes", async () => {
    const { root, dataDirectory } = await createScannerDirectories();
    const playlistDirectory = path.join(root, "Existing Playlist");
    await fs.mkdir(playlistDirectory);
    await fs.writeFile(path.join(playlistDirectory, "01 - Existing.mp4"), "existing");
    const standalone = path.join(root, "Standalone.mp4");
    await fs.writeFile(standalone, "standalone");

    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: root,
      DATA_DIR: dataDirectory,
    });
    const database = await createTestDatabase(configuration);
    await seedTestProfile(database);
    const probeCalls: string[] = [];
    let emitWatchEvent = (_filename: string): void => {
      throw new Error("Library monitoring has not started");
    };
    const scanner = createScanner({
      configuration,
      repository: createLibraryRepository(database.connection),
      logger: createLogger(),
      watchDirectory: (_directory, _options, listener) => {
        emitWatchEvent = (filename) => listener("change", filename);
        return {
          on() {
            return this;
          },
          close() {},
        };
      },
      probe: async (filename) => {
        probeCalls.push(path.basename(filename));
        return probeResult((await fs.stat(filename)).size);
      },
    });

    await scanner.scanLibrary();
    monitorStops.push(scanner.startMonitoring());
    await fs.writeFile(
      `${standalone}.json`,
      JSON.stringify({ version: 1, chapters: [{ title: "Saved point", startSeconds: 5 }] }),
    );
    emitWatchEvent("Standalone.mp4.json");
    await waitUntil(
      async () => (await database.connection("chapters").pluck("title"))[0] === "Saved point",
    );
    expect(probeCalls).toEqual(["01 - Existing.mp4", "Standalone.mp4"]);

    const addedPlaylist = path.join(root, "Added Playlist");
    await fs.mkdir(addedPlaylist);
    await fs.writeFile(path.join(addedPlaylist, "01 - Added.mp4"), "added");
    emitWatchEvent("Added Playlist/01 - Added.mp4");
    await waitUntil(
      async () =>
        Number((await database.connection("playlists").count({ count: "id" }).first())?.count) ===
        2,
    );
    expect(probeCalls).toEqual(["01 - Existing.mp4", "Standalone.mp4", "01 - Added.mp4"]);

    await fs.rm(addedPlaylist, { recursive: true });
    emitWatchEvent("Added Playlist");
    await waitUntil(
      async () =>
        Number((await database.connection("playlists").count({ count: "id" }).first())?.count) ===
        1,
    );
    expect(probeCalls).toEqual(["01 - Existing.mp4", "Standalone.mp4", "01 - Added.mp4"]);
  });

  it("clears resolved playlist cover warnings", async () => {
    const { root, dataDirectory } = await createScannerDirectories();
    const playlistDirectory = path.join(root, "Playlist");
    await fs.mkdir(playlistDirectory);
    await fs.writeFile(
      path.join(playlistDirectory, "playlist.json"),
      JSON.stringify({ version: 1, cover: "missing.jpg" }),
    );
    await fs.writeFile(path.join(playlistDirectory, "Video.mp4"), "video");
    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: root,
      DATA_DIR: dataDirectory,
    });
    const database = await createTestDatabase(configuration);
    await seedTestProfile(database);
    let emitWatchEvent = (_filename: string): void => {};
    const scanner = createScanner({
      configuration,
      repository: createLibraryRepository(database.connection),
      logger: createLogger(),
      watchDirectory: (_directory, _options, listener) => {
        emitWatchEvent = (filename) => listener("change", filename);
        return {
          on() {
            return this;
          },
          close() {},
        };
      },
      probe: async (filename) => probeResult((await fs.stat(filename)).size),
    });

    expect((await scanner.scanLibrary()).warnings).toEqual([
      { path: "Playlist/missing.jpg", message: "Configured cover does not exist" },
    ]);
    monitorStops.push(scanner.startMonitoring());
    await fs.writeFile(path.join(playlistDirectory, "missing.jpg"), "cover");
    emitWatchEvent("Playlist/missing.jpg");
    await waitUntil(async () => scanner.scanStatus().warnings.length === 0);
    await expect(database.connection("playlists").pluck("cover_path")).resolves.toEqual([
      "Playlist/missing.jpg",
    ]);
  });

  it("fails when library monitoring cannot start", async () => {
    const { root, dataDirectory } = await createScannerDirectories();
    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: root,
      DATA_DIR: dataDirectory,
    });
    const database = await createTestDatabase(configuration);
    await seedTestProfile(database);
    const scanner = createScanner({
      configuration,
      repository: createLibraryRepository(database.connection),
      logger: createLogger(),
      watchDirectory: () => {
        throw new Error("Library watcher unavailable");
      },
    });

    expect(() => scanner.startMonitoring()).toThrow("Library watcher unavailable");
  });

  it("falls back to scheduled scans when an active watcher fails", async () => {
    const { root, dataDirectory } = await createScannerDirectories();
    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: root,
      DATA_DIR: dataDirectory,
    });
    const database = await createTestDatabase(configuration);
    await seedTestProfile(database);
    let closeCount = 0;
    let failWatcher: ((error: Error) => void) | undefined;
    const logger = createLogger();
    const warn = vi.spyOn(logger, "warn");
    const scanner = createScanner({
      configuration,
      repository: createLibraryRepository(database.connection),
      logger,
      watchDirectory: () => ({
        on(_event, listener) {
          failWatcher = listener;
          return this;
        },
        close: () => {
          closeCount += 1;
        },
      }),
    });

    const stopMonitoring = scanner.startMonitoring();
    failWatcher?.(new Error("Library watcher unavailable"));
    stopMonitoring();

    expect(closeCount).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      "Library watcher unavailable; scheduled scans will continue",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});

async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for library synchronization");
}
