import type { Knex } from "knex";
import { z } from "zod";

import { matchVideoSearch } from "./video-search.js";

export interface PlaylistRow {
  id: string;
  title: string;
  description: string;
  tags_json: string;
  cover_path: string | null;
  source_provider: string | null;
  source_url: string | null;
  authors_json: string;
  video_count: number;
  completed_count: number;
  total_duration: number;
  next_video_id: string;
  first_video_id: string | null;
}

export interface VideoRow {
  id: string;
  path: string;
  playlist_id: string | null;
  playlist_title: string | null;
  playlist_description: string | null;
  playlist_tags_json: string | null;
  playlist_authors_json: string;
  playlist_section_id: string | null;
  playlist_section_title: string | null;
  title: string;
  description: string;
  tags_json: string;
  authors_json: string;
  source_provider: string | null;
  source_url: string | null;
  duration_seconds: number;
  browser_compatible: number;
  video_codec: string;
  audio_codec: string | null;
  container: string;
  position_seconds: number | null;
  completed: number | null;
  progress_updated_at: string | null;
  sort_order: number;
  playlist_section_sort_order: number | null;
}

export interface ChapterRow {
  id: string;
  video_id: string;
  title: string;
  start_seconds: number;
  sort_order: number;
}

export interface FilterCountRow {
  name: string;
  count: number;
}

export type LibraryFacetScope = "videos" | "playlists";

export interface VideoFilters {
  query?: string;
  author?: string[];
  tag?: string[];
}

export interface VideoPagination {
  limit: number;
  offset: number;
}

export interface VideoSearchPage {
  videos: VideoRow[];
  total: number;
}

export interface LibraryRepository {
  listVideos(filters?: VideoFilters, pagination?: VideoPagination): Promise<VideoRow[]>;
  searchVideos(
    filters: VideoFilters & { query: string },
    pagination: VideoPagination,
  ): Promise<VideoSearchPage>;
  countVideos(filters?: VideoFilters): Promise<number>;
  listPlaylists(filters?: VideoFilters): Promise<PlaylistRow[]>;
  listAuthors(scope?: LibraryFacetScope): Promise<FilterCountRow[]>;
  listTags(scope?: LibraryFacetScope): Promise<FilterCountRow[]>;
  listContinueWatching(): Promise<VideoRow[]>;
  findPlaylist(playlistId: string): Promise<PlaylistRow | undefined>;
  listPlaylistVideos(playlistId: string): Promise<VideoRow[]>;
  findVideo(videoId: string): Promise<VideoRow | undefined>;
  listVideoChapters(videoId: string): Promise<ChapterRow[]>;
}

const videoSelect = [
  "videos.id",
  "videos.path",
  "videos.playlist_id",
  "playlists.title as playlist_title",
  "playlists.description as playlist_description",
  "playlists.tags_json as playlist_tags_json",
  "videos.playlist_section_id",
  "playlist_sections.title as playlist_section_title",
  "videos.title",
  "videos.description",
  "videos.tags_json",
  "videos.source_provider",
  "videos.source_url",
  "videos.duration_seconds",
  "videos.browser_compatible",
  "videos.video_codec",
  "videos.audio_codec",
  "videos.container",
  "progress.position_seconds",
  "progress.completed",
  "progress.updated_at as progress_updated_at",
  "videos.sort_order",
  "playlist_sections.sort_order as playlist_section_sort_order",
];

const stringListSchema = z.array(z.string());

function stringList(value: string | null): string[] {
  return stringListSchema.parse(JSON.parse(value ?? "[]"));
}

export function createLibraryApiRepository(database: Knex, profileId: string): LibraryRepository {
  const videoAuthorsJson = database.raw(`
    COALESCE((
      SELECT json_group_array(name)
      FROM (
        SELECT video_authors.video_id, authors.name
        FROM video_authors
        JOIN authors ON authors.id = video_authors.author_id
        ORDER BY video_authors.video_id, video_authors.sort_order
      ) AS ordered_video_authors
      WHERE ordered_video_authors.video_id = videos.id
    ), '[]') AS authors_json
  `);
  const playlistAuthorsJson = database.raw(`
    COALESCE((
      SELECT json_group_array(name)
      FROM (
        SELECT playlist_authors.playlist_id, authors.name
        FROM playlist_authors
        JOIN authors ON authors.id = playlist_authors.author_id
        ORDER BY playlist_authors.playlist_id, playlist_authors.sort_order
      ) AS ordered_playlist_authors
      WHERE ordered_playlist_authors.playlist_id = videos.playlist_id
    ), '[]') AS playlist_authors_json
  `);

  function createVideosQuery() {
    return database<VideoRow>("videos")
      .leftJoin("playlists", "playlists.id", "videos.playlist_id")
      .leftJoin("playlist_sections", "playlist_sections.id", "videos.playlist_section_id")
      .leftJoin("progress", (join) => {
        join.on("progress.video_id", "videos.id").andOnVal("progress.profile_id", profileId);
      })
      .select([...videoSelect, videoAuthorsJson, playlistAuthorsJson]);
  }

  function createPlaylistsQuery() {
    return database<PlaylistRow>("playlists")
      .leftJoin("videos", "videos.playlist_id", "playlists.id")
      .leftJoin("progress", (join) => {
        join.on("progress.video_id", "videos.id").andOnVal("progress.profile_id", profileId);
      })
      .select(
        "playlists.id",
        "playlists.title",
        "playlists.description",
        "playlists.tags_json",
        "playlists.cover_path",
        "playlists.source_provider",
        "playlists.source_url",
        database.raw(`
          COALESCE((
            SELECT json_group_array(name)
            FROM (
              SELECT playlist_authors.playlist_id, authors.name
              FROM playlist_authors
              JOIN authors ON authors.id = playlist_authors.author_id
              ORDER BY playlist_authors.playlist_id, playlist_authors.sort_order
            ) AS ordered_playlist_authors
            WHERE ordered_playlist_authors.playlist_id = playlists.id
          ), '[]') AS authors_json
        `),
        database.raw("COUNT(DISTINCT videos.id) as video_count"),
        database.raw(
          "COUNT(DISTINCT CASE WHEN progress.completed = 1 THEN videos.id END) as completed_count",
        ),
        database.raw("COALESCE(SUM(videos.duration_seconds), 0) as total_duration"),
        database.raw(
          `
          COALESCE(
            (
              SELECT candidate.id
              FROM videos AS candidate
              LEFT JOIN progress AS candidate_progress ON candidate_progress.video_id = candidate.id
                AND candidate_progress.profile_id = ?
              WHERE candidate.playlist_id = playlists.id
                AND COALESCE(candidate_progress.completed, 0) = 0
              ORDER BY candidate.sort_order
              LIMIT 1
            ),
            (
              SELECT candidate.id
              FROM videos AS candidate
              WHERE candidate.playlist_id = playlists.id
              ORDER BY candidate.sort_order
              LIMIT 1
            )
          ) AS next_video_id
        `,
          [profileId],
        ),
        database.raw(`
          (
            SELECT candidate.id
            FROM videos AS candidate
            WHERE candidate.playlist_id = playlists.id
            ORDER BY candidate.sort_order
            LIMIT 1
          ) AS first_video_id
        `),
      )
      .groupBy("playlists.id")
      .havingRaw("COUNT(DISTINCT videos.id) > 0");
  }

  function applyVideoFilters(
    queryBuilder: Knex.QueryBuilder,
    { query, author, tag }: VideoFilters = {},
  ): void {
    if (author?.length) {
      const placeholders = author.map(() => "?").join(", ");
      queryBuilder.where((where) => {
        where
          .whereExists(
            database("video_authors")
              .join("authors", "authors.id", "video_authors.author_id")
              .select(database.raw("1"))
              .whereRaw("video_authors.video_id = videos.id")
              .whereRaw(`authors.name COLLATE NOCASE IN (${placeholders})`, author),
          )
          .orWhereExists(
            database("playlist_authors")
              .join("authors", "authors.id", "playlist_authors.author_id")
              .select(database.raw("1"))
              .whereRaw("playlist_authors.playlist_id = videos.playlist_id")
              .whereRaw(`authors.name COLLATE NOCASE IN (${placeholders})`, author),
          );
      });
    }
    if (tag?.length) {
      const placeholders = tag.map(() => "?").join(", ");
      queryBuilder.where((where) => {
        where
          .whereRaw(
            `EXISTS (SELECT 1 FROM json_each(videos.tags_json) WHERE value COLLATE NOCASE IN (${placeholders}))`,
            tag,
          )
          .orWhereRaw(
            `EXISTS (SELECT 1 FROM json_each(playlists.tags_json) WHERE value COLLATE NOCASE IN (${placeholders}))`,
            tag,
          );
      });
    }
    if (query) {
      const search = `%${query}%`;
      queryBuilder.where((where) => {
        where
          .whereLike("videos.title", search)
          .orWhereLike("videos.description", search)
          .orWhereLike("videos.tags_json", search)
          .orWhereLike("playlists.title", search)
          .orWhereLike("playlists.description", search)
          .orWhereLike("playlists.tags_json", search)
          .orWhereExists(
            database("video_authors")
              .join("authors", "authors.id", "video_authors.author_id")
              .select(database.raw("1"))
              .whereRaw("video_authors.video_id = videos.id")
              .whereLike("authors.name", search),
          )
          .orWhereExists(
            database("playlist_authors")
              .join("authors", "authors.id", "playlist_authors.author_id")
              .select(database.raw("1"))
              .whereRaw("playlist_authors.playlist_id = videos.playlist_id")
              .whereLike("authors.name", search),
          );
      });
    }
  }

  return {
    async listVideos(filters = {}, pagination) {
      const queryBuilder = createVideosQuery()
        .orderByRaw("videos.playlist_id IS NOT NULL")
        .orderBy("playlists.sort_order")
        .orderBy("videos.sort_order");
      applyVideoFilters(queryBuilder, filters);
      if (pagination) queryBuilder.limit(pagination.limit).offset(pagination.offset);
      return queryBuilder;
    },

    async searchVideos({ query, ...filters }, pagination) {
      const queryBuilder = createVideosQuery()
        .orderByRaw("videos.playlist_id IS NOT NULL")
        .orderBy("playlists.sort_order")
        .orderBy("videos.sort_order");
      applyVideoFilters(queryBuilder, filters);
      const ranked = (await queryBuilder)
        .map((video) => ({
          video,
          match: matchVideoSearch(
            {
              title: video.title,
              description: video.description,
              authors: [
                ...stringList(video.authors_json),
                ...stringList(video.playlist_authors_json),
              ],
              playlistTitle: video.playlist_title,
              playlistDescription: video.playlist_description,
              tags: [...stringList(video.tags_json), ...stringList(video.playlist_tags_json)],
            },
            query,
          ),
        }))
        .filter((entry) => entry.match !== null)
        .sort(
          (left, right) =>
            left.match!.score - right.match!.score ||
            left.video.title.localeCompare(right.video.title),
        );
      return {
        videos: ranked
          .slice(pagination.offset, pagination.offset + pagination.limit)
          .map((entry) => entry.video),
        total: ranked.length,
      };
    },

    async countVideos(filters = {}) {
      const queryBuilder = database("videos")
        .leftJoin("playlists", "playlists.id", "videos.playlist_id")
        .countDistinct({ video_count: "videos.id" });
      applyVideoFilters(queryBuilder, filters);
      const row = await queryBuilder.first<{ video_count?: number | string }>();
      return Number(row?.video_count ?? 0);
    },

    listPlaylists({ query, author, tag } = {}) {
      const queryBuilder = createPlaylistsQuery().orderBy("playlists.sort_order");
      if (author?.length) {
        const placeholders = author.map(() => "?").join(", ");
        queryBuilder.whereExists(
          database("playlist_authors")
            .join("authors", "authors.id", "playlist_authors.author_id")
            .select(database.raw("1"))
            .whereRaw("playlist_authors.playlist_id = playlists.id")
            .whereRaw(`authors.name COLLATE NOCASE IN (${placeholders})`, author),
        );
      }
      if (tag?.length) {
        const placeholders = tag.map(() => "?").join(", ");
        queryBuilder.whereRaw(
          `EXISTS (SELECT 1 FROM json_each(playlists.tags_json) WHERE value COLLATE NOCASE IN (${placeholders}))`,
          tag,
        );
      }
      if (query) {
        const search = `%${query}%`;
        queryBuilder.where((where) => {
          where
            .whereLike("playlists.title", search)
            .orWhereLike("playlists.description", search)
            .orWhereLike("playlists.tags_json", search)
            .orWhereExists(
              database("playlist_authors")
                .join("authors", "authors.id", "playlist_authors.author_id")
                .select(database.raw("1"))
                .whereRaw("playlist_authors.playlist_id = playlists.id")
                .whereLike("authors.name", search),
            );
        });
      }
      return queryBuilder;
    },

    async listAuthors(scope = "videos") {
      if (scope === "playlists") {
        return database("playlist_authors")
          .join("authors", "authors.id", "playlist_authors.author_id")
          .join("videos", "videos.playlist_id", "playlist_authors.playlist_id")
          .select<FilterCountRow[]>(database.raw("MIN(authors.name) as name"))
          .countDistinct("playlist_authors.playlist_id as count")
          .groupByRaw("authors.name COLLATE NOCASE")
          .orderByRaw("authors.name COLLATE NOCASE");
      }
      return database
        .from(
          database
            .select("authors.name", "video_authors.video_id")
            .from("video_authors")
            .join("authors", "authors.id", "video_authors.author_id")
            .unionAll(
              database
                .select("authors.name", "videos.id as video_id")
                .from("playlist_authors")
                .join("authors", "authors.id", "playlist_authors.author_id")
                .join("videos", "videos.playlist_id", "playlist_authors.playlist_id"),
            )
            .as("effective_authors"),
        )
        .select<FilterCountRow[]>(database.raw("MIN(name) as name"))
        .countDistinct("video_id as count")
        .groupByRaw("name COLLATE NOCASE")
        .orderByRaw("name COLLATE NOCASE");
    },

    async listTags(scope = "videos") {
      if (scope === "playlists") {
        return database("playlists")
          .join("videos", "videos.playlist_id", "playlists.id")
          .joinRaw("JOIN json_each(playlists.tags_json) AS playlist_tag")
          .select<FilterCountRow[]>(database.raw("MIN(playlist_tag.value) as name"))
          .countDistinct("playlists.id as count")
          .groupByRaw("playlist_tag.value COLLATE NOCASE")
          .orderByRaw("playlist_tag.value COLLATE NOCASE");
      }
      return database
        .from(
          database
            .select("video_tag.value as name", "videos.id as video_id")
            .from("videos")
            .joinRaw("JOIN json_each(videos.tags_json) AS video_tag")
            .unionAll(
              database
                .select("playlist_tag.value as name", "videos.id as video_id")
                .from("videos")
                .join("playlists", "playlists.id", "videos.playlist_id")
                .joinRaw("JOIN json_each(playlists.tags_json) AS playlist_tag"),
            )
            .as("effective_tags"),
        )
        .select<FilterCountRow[]>(database.raw("MIN(name) as name"))
        .countDistinct("video_id as count")
        .groupByRaw("name COLLATE NOCASE")
        .orderByRaw("name COLLATE NOCASE");
    },

    listContinueWatching() {
      return createVideosQuery()
        .where("progress.position_seconds", ">", 0)
        .where("progress.completed", false)
        .orderBy("progress.updated_at", "desc")
        .limit(12);
    },

    findPlaylist(playlistId) {
      return createPlaylistsQuery().where("playlists.id", playlistId).first();
    },

    listPlaylistVideos(playlistId) {
      return createVideosQuery()
        .where("videos.playlist_id", playlistId)
        .orderBy("videos.sort_order");
    },

    findVideo(videoId) {
      return createVideosQuery().where("videos.id", videoId).first();
    },

    listVideoChapters(videoId) {
      return database<ChapterRow>("chapters")
        .where({ video_id: videoId })
        .orderBy("sort_order")
        .select("id", "video_id", "title", "start_seconds", "sort_order");
    },
  };
}
