import type { Knex } from "knex";
import { z } from "zod";

import type { LibrarySnapshot, PlaylistRecord, VideoRecord } from "./types.js";

export interface RootEntryOrder {
  id: string;
  kind: "playlist" | "video";
  sortOrder: number;
}

export interface StoredRootEntry {
  id: string;
  kind: "playlist" | "video";
  path: string;
}

export interface LibraryCounts {
  playlistCount: number;
  videoCount: number;
}

interface StoredVideoRow {
  audio_codec: string | null;
  browser_compatible: boolean | number;
  container: string;
  description: string;
  duration_seconds: number;
  id: string;
  modified_at: string;
  path: string;
  playlist_id: string | null;
  playlist_section_id: string | null;
  size_bytes: number;
  sort_order: number;
  source_provider: string | null;
  source_url: string | null;
  tags_json: string;
  title: string;
  video_codec: string;
}

interface StoredPlaylistRow {
  cover_path: string | null;
  description: string;
  id: string;
  path: string;
  sort_order: number;
  source_provider: string | null;
  source_url: string | null;
  tags_json: string;
  title: string;
}

const storedTagsSchema = z.array(z.string());

export interface LibraryRepository {
  synchronizeLibrary(snapshot: LibrarySnapshot): Promise<void>;
  synchronizeEntries(
    snapshot: LibrarySnapshot,
    entryIds: string[],
    rootOrder: RootEntryOrder[],
  ): Promise<void>;
  getRootEntries(): Promise<StoredRootEntry[]>;
  getPlaylistCover(
    playlistId: string,
  ): Promise<{ id: string; cover_path: string | null; first_video_id: string | null } | undefined>;
  getPlaylists(): Promise<PlaylistRecord[]>;
  getVideos(): Promise<VideoRecord[]>;
  getVideo(videoId: string): Promise<VideoRecord | undefined>;
  getChapters(): Promise<Array<{ videoId: string; startSeconds: number; sortOrder: number }>>;
  getLibraryCounts(): Promise<LibraryCounts>;
}

export function createLibraryRepository(database: Knex): LibraryRepository {
  return {
    async synchronizeLibrary(snapshot) {
      await database.transaction(async (transaction) => {
        await upsertSnapshot(transaction, snapshot);
        await reconcileSnapshotChildren(transaction, snapshot);
        await deleteMissingRecords(transaction, "videos", [
          ...snapshot.videos.map((video) => video.id),
          ...snapshot.skippedVideoIds,
        ]);
        await deleteMissingRecords(
          transaction,
          "playlist_sections",
          snapshot.playlistSections.map((section) => section.id),
        );
        await deleteMissingRecords(
          transaction,
          "playlists",
          snapshot.playlists.map((playlist) => playlist.id),
        );
        await deleteOrphanAuthors(transaction);
      });
    },

    async synchronizeEntries(snapshot, entryIds, rootOrder) {
      if (entryIds.length === 0) return;
      await database.transaction(async (transaction) => {
        await upsertSnapshot(transaction, snapshot);

        for (const entry of rootOrder) {
          const table = entry.kind === "playlist" ? "playlists" : "videos";
          const query = transaction(table).where({ id: entry.id });
          if (entry.kind === "video") query.whereNull("playlist_id");
          await query.update({ sort_order: entry.sortOrder });
        }

        await reconcileSnapshotChildren(transaction, snapshot);

        const retainedVideoIds = [
          ...snapshot.videos.map((video) => video.id),
          ...snapshot.skippedVideoIds,
        ];
        const playlistVideos = transaction("videos").whereIn("playlist_id", entryIds);
        if (retainedVideoIds.length > 0) {
          await playlistVideos.whereNotIn("id", retainedVideoIds).delete();
        } else await playlistVideos.delete();

        const standaloneVideos = transaction("videos")
          .whereNull("playlist_id")
          .whereIn("id", entryIds);
        if (retainedVideoIds.length > 0) {
          await standaloneVideos.whereNotIn("id", retainedVideoIds).delete();
        } else await standaloneVideos.delete();

        const retainedSectionIds = snapshot.playlistSections.map((section) => section.id);
        const sections = transaction("playlist_sections").whereIn("playlist_id", entryIds);
        if (retainedSectionIds.length > 0) {
          await sections.whereNotIn("id", retainedSectionIds).delete();
        } else await sections.delete();

        const retainedPlaylistIds = snapshot.playlists.map((playlist) => playlist.id);
        const playlists = transaction("playlists").whereIn("id", entryIds);
        if (retainedPlaylistIds.length > 0) {
          await playlists.whereNotIn("id", retainedPlaylistIds).delete();
        } else await playlists.delete();

        await deleteOrphanAuthors(transaction);
      });
    },

    async getRootEntries() {
      const [playlists, videos] = await Promise.all([
        database("playlists").select("id", "path"),
        database("videos").whereNull("playlist_id").select("id", "path"),
      ]);
      return [
        ...playlists.map((row) => ({
          id: String(row.id),
          kind: "playlist" as const,
          path: String(row.path),
        })),
        ...videos.map((row) => ({
          id: String(row.id),
          kind: "video" as const,
          path: String(row.path),
        })),
      ];
    },

    async getVideos() {
      const rows = await database<StoredVideoRow>("videos").select();
      return rows.map(videoRecord);
    },

    async getPlaylistCover(playlistId) {
      return database("playlists")
        .where({ id: playlistId })
        .select(
          "id",
          "cover_path",
          database.raw(
            "(SELECT id FROM videos WHERE playlist_id = playlists.id ORDER BY sort_order LIMIT 1) AS first_video_id",
          ),
        )
        .first();
    },
    async getPlaylists() {
      const rows = await database<StoredPlaylistRow>("playlists").select();
      return rows.map(playlistRecord);
    },

    async getVideo(videoId) {
      const row = await database<StoredVideoRow>("videos").where({ id: videoId }).first();
      return row ? videoRecord(row) : undefined;
    },

    async getChapters() {
      const rows = await database("chapters").select("video_id", "start_seconds", "sort_order");
      return rows.map((row) => ({
        videoId: String(row.video_id),
        startSeconds: Number(row.start_seconds),
        sortOrder: Number(row.sort_order),
      }));
    },

    async getLibraryCounts() {
      const [playlists, videos] = await Promise.all([
        database("playlists").count<{ count: number }[]>({ count: "id" }).first(),
        database("videos").count<{ count: number }[]>({ count: "id" }).first(),
      ]);
      return {
        playlistCount: Number(playlists?.count ?? 0),
        videoCount: Number(videos?.count ?? 0),
      };
    },
  };
}

function playlistRecord(row: StoredPlaylistRow): PlaylistRecord {
  return {
    id: String(row.id),
    path: String(row.path),
    title: String(row.title),
    description: String(row.description),
    tags: storedTagsSchema.parse(JSON.parse(row.tags_json)),
    coverPath: row.cover_path === null ? null : String(row.cover_path),
    sourceProvider: row.source_provider === null ? null : String(row.source_provider),
    sourceUrl: row.source_url === null ? null : String(row.source_url),
    sortOrder: Number(row.sort_order),
  };
}

function videoRecord(row: StoredVideoRow): VideoRecord {
  return {
    id: String(row.id),
    path: String(row.path),
    playlistId: row.playlist_id === null ? null : String(row.playlist_id),
    playlistSectionId: row.playlist_section_id === null ? null : String(row.playlist_section_id),
    title: String(row.title),
    description: String(row.description),
    tags: storedTagsSchema.parse(JSON.parse(row.tags_json)),
    sourceProvider: row.source_provider === null ? null : String(row.source_provider),
    sourceUrl: row.source_url === null ? null : String(row.source_url),
    sortOrder: Number(row.sort_order),
    durationSeconds: Number(row.duration_seconds),
    sizeBytes: Number(row.size_bytes),
    container: String(row.container),
    videoCodec: String(row.video_codec),
    audioCodec: row.audio_codec === null ? null : String(row.audio_codec),
    browserCompatible: Boolean(row.browser_compatible),
    modifiedAt: String(row.modified_at),
  };
}

async function upsertSnapshot(
  transaction: Knex.Transaction,
  snapshot: LibrarySnapshot,
): Promise<void> {
  for (const playlist of snapshot.playlists) {
    await transaction("playlists")
      .insert({
        id: playlist.id,
        path: playlist.path,
        title: playlist.title,
        description: playlist.description,
        tags_json: JSON.stringify(playlist.tags),
        cover_path: playlist.coverPath,
        source_provider: playlist.sourceProvider,
        source_url: playlist.sourceUrl,
        sort_order: playlist.sortOrder,
      })
      .onConflict("id")
      .merge();
  }

  for (const section of snapshot.playlistSections) {
    await transaction("playlist_sections")
      .insert({
        id: section.id,
        playlist_id: section.playlistId,
        path: section.path,
        title: section.title,
        sort_order: section.sortOrder,
      })
      .onConflict("id")
      .merge();
  }

  for (const video of snapshot.videos) {
    const existing = await transaction("videos")
      .where({ id: video.id })
      .select("modified_at", "size_bytes")
      .first();
    if (
      existing &&
      (existing.modified_at !== video.modifiedAt || Number(existing.size_bytes) !== video.sizeBytes)
    ) {
      await transaction("conversions").where({ video_id: video.id }).delete();
    }
    await transaction("videos")
      .insert({
        id: video.id,
        path: video.path,
        playlist_id: video.playlistId,
        playlist_section_id: video.playlistSectionId,
        title: video.title,
        description: video.description,
        tags_json: JSON.stringify(video.tags),
        source_provider: video.sourceProvider,
        source_url: video.sourceUrl,
        sort_order: video.sortOrder,
        duration_seconds: video.durationSeconds,
        size_bytes: video.sizeBytes,
        container: video.container,
        video_codec: video.videoCodec,
        audio_codec: video.audioCodec,
        browser_compatible: video.browserCompatible,
        modified_at: video.modifiedAt,
      })
      .onConflict("id")
      .merge();
  }

  for (const author of snapshot.authors) {
    await transaction("authors")
      .insert({ id: author.id, name: author.name, normalized_name: author.normalizedName })
      .onConflict("normalized_name")
      .merge({ name: author.name });
  }

  for (const relation of snapshot.playlistAuthors) {
    await transaction("playlist_authors")
      .insert({
        playlist_id: relation.playlistId,
        author_id: relation.authorId,
        sort_order: relation.sortOrder,
      })
      .onConflict(["playlist_id", "author_id"])
      .merge({ sort_order: relation.sortOrder });
  }

  for (const relation of snapshot.videoAuthors) {
    await transaction("video_authors")
      .insert({
        video_id: relation.videoId,
        author_id: relation.authorId,
        sort_order: relation.sortOrder,
      })
      .onConflict(["video_id", "author_id"])
      .merge({ sort_order: relation.sortOrder });
  }

  for (const chapter of snapshot.chapters) {
    await transaction("chapters")
      .insert({
        id: chapter.id,
        video_id: chapter.videoId,
        title: chapter.title,
        start_seconds: chapter.startSeconds,
        sort_order: chapter.sortOrder,
      })
      .onConflict("id")
      .merge();
  }
}

async function reconcileSnapshotChildren(
  transaction: Knex.Transaction,
  snapshot: LibrarySnapshot,
): Promise<void> {
  const chapterIdsByVideo = new Map<string, string[]>();
  for (const chapter of snapshot.chapters) {
    const ids = chapterIdsByVideo.get(chapter.videoId) ?? [];
    ids.push(chapter.id);
    chapterIdsByVideo.set(chapter.videoId, ids);
  }
  for (const video of snapshot.videos) {
    await deleteMissingWhere(
      transaction("chapters").where({ video_id: video.id }),
      chapterIdsByVideo.get(video.id) ?? [],
    );
    await deleteMissingWhere(
      transaction("video_authors").where({ video_id: video.id }),
      snapshot.videoAuthors
        .filter((relation) => relation.videoId === video.id)
        .map((relation) => relation.authorId),
      "author_id",
    );
  }
  for (const playlist of snapshot.playlists) {
    await deleteMissingWhere(
      transaction("playlist_authors").where({ playlist_id: playlist.id }),
      snapshot.playlistAuthors
        .filter((relation) => relation.playlistId === playlist.id)
        .map((relation) => relation.authorId),
      "author_id",
    );
  }
}

async function deleteMissingWhere(
  query: Knex.QueryBuilder,
  ids: string[],
  column = "id",
): Promise<void> {
  if (ids.length > 0) await query.whereNotIn(column, ids).delete();
  else await query.delete();
}

async function deleteMissingRecords(
  transaction: Knex.Transaction,
  table: "playlists" | "playlist_sections" | "videos",
  ids: string[],
): Promise<void> {
  await deleteMissingWhere(transaction(table), ids);
}

async function deleteOrphanAuthors(transaction: Knex.Transaction): Promise<void> {
  await transaction("authors")
    .whereNotExists(
      transaction("playlist_authors").select(1).whereRaw("playlist_authors.author_id = authors.id"),
    )
    .whereNotExists(
      transaction("video_authors").select(1).whereRaw("video_authors.author_id = authors.id"),
    )
    .delete();
}
