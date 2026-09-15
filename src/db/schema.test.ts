import { describe, expect, it } from "vitest";

import { createTestDatabase } from "../test/resources.js";

describe("database schema", () => {
  it("creates only the application tables", async () => {
    const database = await createTestDatabase();

    const tables = (
      await database.connection("sqlite_master").where({ type: "table" }).pluck("name")
    )
      .filter((name: string) => !name.startsWith("knex_") && name !== "sqlite_sequence")
      .sort();
    expect(tables).toEqual([
      "auth_credentials",
      "auth_login_attempts",
      "auth_sessions",
      "authors",
      "chapters",
      "conversions",
      "playlist_authors",
      "playlist_sections",
      "playlists",
      "profile_settings",
      "profile_unlock_attempts",
      "profiles",
      "progress",
      "video_authors",
      "videos",
    ]);
    await expect(database.connection("knex_migrations").pluck("name")).resolves.toEqual([
      "202608160001_create_schema.js",
    ]);

    await expect(database.connection("playlists").columnInfo()).resolves.not.toHaveProperty(
      "created_at",
    );
    await expect(database.connection("playlists").columnInfo()).resolves.not.toHaveProperty(
      "updated_at",
    );
    await expect(database.connection("playlists").columnInfo()).resolves.not.toHaveProperty(
      "cover_origin",
    );
    await expect(database.connection("videos").columnInfo()).resolves.not.toHaveProperty(
      "cover_path",
    );
    await expect(database.connection("conversions").columnInfo()).resolves.toEqual(
      expect.objectContaining({
        video_id: expect.any(Object),
        status: expect.any(Object),
        progress: expect.any(Object),
        error: expect.any(Object),
      }),
    );
  });

  it("keeps playlist sections and normalized authors consistent", async () => {
    const database = await createTestDatabase();
    await database.connection("playlists").insert([
      { id: "playlist-a", path: "A", title: "A", sort_order: 0 },
      { id: "playlist-b", path: "B", title: "B", sort_order: 1 },
    ]);
    await database.connection("playlist_sections").insert({
      id: "section-a",
      playlist_id: "playlist-a",
      path: "A/Section",
      title: "Section",
      sort_order: 0,
    });

    const video = {
      id: "video-a",
      path: "B/Video.mp4",
      playlist_id: "playlist-b",
      playlist_section_id: "section-a",
      title: "Video",
      sort_order: 0,
      duration_seconds: 60,
      size_bytes: 100,
      container: "mp4",
      video_codec: "h264",
      browser_compatible: true,
      modified_at: "2026-08-21T00:00:00.000Z",
    };

    await expect(database.connection("videos").insert(video)).rejects.toThrow();

    await database.connection("authors").insert({
      id: "author-a",
      name: "Example Author",
      normalized_name: "example author",
    });
    await expect(
      database.connection("authors").insert({
        id: "author-b",
        name: "EXAMPLE AUTHOR",
        normalized_name: "example author",
      }),
    ).rejects.toThrow();
  });
});
