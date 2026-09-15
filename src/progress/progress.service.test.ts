import { seedTestProfile, testProfileId } from "../test/resources.js";
import { beforeEach, describe, expect, it } from "vitest";

import type { Database } from "../db/db.js";
import { createLibraryApiRepository } from "../library/library.repository.js";
import { createTestDatabase } from "../test/resources.js";
import { createProgressRepository } from "./progress.repository.js";
import { createProgressService } from "./progress.service.js";

let database: Database;

beforeEach(async () => {
  database = await createTestDatabase();
  await seedTestProfile(database);
  const now = new Date().toISOString();
  await database.connection("playlists").insert({
    id: "a".repeat(24),
    path: "playlist",
    title: "Playlist",
    description: "",
    sort_order: 0,
  });
  await database.connection("videos").insert({
    id: "b".repeat(24),
    playlist_id: "a".repeat(24),
    path: "playlist/video.mp4",
    title: "Video",
    sort_order: 0,
    duration_seconds: 100,
    size_bytes: 100,
    container: "mp4",
    video_codec: "h264",
    audio_codec: "aac",
    browser_compatible: true,
    modified_at: now,
  });
});

describe("progress service", () => {
  it("marks an in-progress video as most recently opened", async () => {
    const service = createProgressService(
      createProgressRepository(database.connection, testProfileId),
      createLibraryApiRepository(database.connection, testProfileId),
    );
    await service.updateProgress("b".repeat(24), 25);
    await database
      .connection("progress")
      .where({ video_id: "b".repeat(24) })
      .update({ updated_at: "2020-01-01T00:00:00.000Z" });

    expect(await service.openVideo("b".repeat(24))).toBe(true);
    expect(await database.connection("progress").first()).toMatchObject({
      position_seconds: 25,
      completed: 0,
    });
    expect((await database.connection("progress").first()).updated_at).not.toBe(
      "2020-01-01T00:00:00.000Z",
    );
  });

  it("clamps positions and completes only through the completion action", async () => {
    const service = createProgressService(
      createProgressRepository(database.connection, testProfileId),
      createLibraryApiRepository(database.connection, testProfileId),
    );

    expect(await service.updateProgress("b".repeat(24), 150)).toBe(true);
    expect(await database.connection("progress").first()).toMatchObject({
      position_seconds: 100,
      completed: 0,
    });
    expect(await service.completeVideo("b".repeat(24))).toBe(true);
    expect(await database.connection("progress").first()).toMatchObject({
      position_seconds: 100,
      completed: 1,
    });
  });

  it("resets video and playlist progress", async () => {
    const service = createProgressService(
      createProgressRepository(database.connection, testProfileId),
      createLibraryApiRepository(database.connection, testProfileId),
    );
    await service.updateProgress("b".repeat(24), 25);
    await service.resetVideo("b".repeat(24));
    expect(await database.connection("progress")).toHaveLength(0);
    await service.updateProgress("b".repeat(24), 30);
    await service.resetPlaylist("a".repeat(24));
    expect(await database.connection("progress")).toHaveLength(0);
  });

  it("ignores zero positions instead of erasing saved progress", async () => {
    const service = createProgressService(
      createProgressRepository(database.connection, testProfileId),
      createLibraryApiRepository(database.connection, testProfileId),
    );

    await service.updateProgress("b".repeat(24), 25);
    await service.updateProgress("b".repeat(24), 0);
    expect(await database.connection("progress").first()).toMatchObject({
      position_seconds: 25,
      completed: 0,
    });

    await service.resetVideo("b".repeat(24));
    await service.updateProgress("b".repeat(24), 0);
    expect(await database.connection("progress")).toHaveLength(0);
  });
});
