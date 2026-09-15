import { z } from "zod";

import type {
  ChapterRow,
  FilterCountRow,
  LibraryFacetScope,
  LibraryRepository,
  PlaylistRow,
  VideoFilters,
  VideoRow,
} from "./library.repository.js";

export interface VideoDto {
  id: string;
  playlistId: string | null;
  playlistTitle: string | null;
  playlistSectionId: string | null;
  playlistSectionTitle: string | null;
  title: string;
  description: string;
  authors: string[];
  tags: string[];
  source: { provider: string; url: string } | null;
  coverUrl: string | null;
  durationSeconds: number;
  positionSeconds: number;
  completed: boolean;
  progressPercent: number;
}

export interface ChapterDto {
  title: string;
  startSeconds: number;
  thumbnailUrl: string | null;
}

export interface VideoDetailDto extends VideoDto {
  chapters: ChapterDto[];
}

export interface PlaylistDto {
  id: string;
  title: string;
  description: string;
  authors: string[];
  tags: string[];
  source: { provider: string; url: string } | null;
  coverUrl: string | null;
  videoCount: number;
  completedCount: number;
  progressPercent: number;
  durationSeconds: number;
  nextVideoId: string;
}

export interface PlaylistDetailDto extends PlaylistDto {
  sections: Array<{
    id: string | null;
    title: string;
    videos: VideoDto[];
  }>;
}

export interface LibraryFilterDto {
  name: string;
  count: number;
}

export type LibraryView = LibraryFacetScope;

export interface LibraryFilters extends VideoFilters {
  page?: number;
  pageSize?: number;
  view?: LibraryView;
}

export interface LibraryPaginationDto {
  page: number;
  pageSize: number;
  totalVideos: number;
  totalPages: number;
}

export interface LibraryService {
  getLibrary(filters?: LibraryFilters): Promise<{
    videos: VideoDto[];
    playlists: PlaylistDto[];
    authors: LibraryFilterDto[];
    tags: LibraryFilterDto[];
    continueWatching: VideoDto[];
    pagination: LibraryPaginationDto;
  }>;
  getVideo(videoId: string): Promise<{
    video: VideoDetailDto;
    playlist: PlaylistDetailDto | null;
  } | null>;
}

export interface LibrarySettings {
  getLibraryPageSize(): Promise<number>;
}

export interface ThumbnailLookup {
  listThumbnailIndex(): Promise<{
    revisions: Map<string, number>;
    chapterStartsByVideo: Map<string, number[]>;
  }>;
}

export interface PlaylistCoverLookup {
  listPlaylistCoverIndex(): Promise<{ revisions: Map<string, number> }>;
}

type ThumbnailLookupIndex = Awaited<ReturnType<ThumbnailLookup["listThumbnailIndex"]>>;
type PlaylistCoverLookupIndex = Awaited<ReturnType<PlaylistCoverLookup["listPlaylistCoverIndex"]>>;
const stringListSchema = z.array(z.string());

function stringList(value: string | null): string[] {
  return value ? stringListSchema.parse(JSON.parse(value)) : [];
}

function mergeNames(...lists: string[][]): string[] {
  const seen = new Set<string>();
  return lists.flat().filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceDto(provider: string | null, url: string | null) {
  return provider && url ? { provider, url } : null;
}

function progressPercent(completed: number, total: number): number {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

function videoCoverUrl(
  videoId: string,
  positionSeconds: number,
  thumbnails: ThumbnailLookupIndex,
): string | null {
  const revision = thumbnails.revisions.get(videoId);
  if (revision === undefined) return null;
  let chapterStart: number | undefined;
  for (const startSeconds of thumbnails.chapterStartsByVideo.get(videoId) ?? []) {
    if (startSeconds > positionSeconds) break;
    chapterStart = startSeconds;
  }
  return chapterStart === undefined
    ? videoPosterUrl(videoId, thumbnails.revisions)
    : `/covers/videos/${videoId}/chapters/${chapterStart}?t=${revision}`;
}

function videoPosterUrl(videoId: string, revisions: Map<string, number>): string | null {
  const revision = revisions.get(videoId);
  return revision === undefined ? null : `/covers/videos/${videoId}?t=${revision}`;
}

function videoDto(row: VideoRow, thumbnails: ThumbnailLookupIndex): VideoDto {
  const position = row.completed ? Number(row.duration_seconds) : Number(row.position_seconds ?? 0);
  return {
    id: row.id,
    playlistId: row.playlist_id,
    playlistTitle: row.playlist_title,
    playlistSectionId: row.playlist_section_id,
    playlistSectionTitle: row.playlist_section_title,
    title: row.title,
    description: row.description,
    authors: mergeNames(stringList(row.authors_json), stringList(row.playlist_authors_json)),
    tags: mergeNames(stringList(row.tags_json), stringList(row.playlist_tags_json)),
    source: sourceDto(row.source_provider, row.source_url),
    coverUrl: videoCoverUrl(row.id, position, thumbnails),
    durationSeconds: Number(row.duration_seconds),
    positionSeconds: position,
    completed: Boolean(row.completed),
    progressPercent: Math.min(100, Math.round((position / Number(row.duration_seconds)) * 100)),
  };
}

function playlistCoverUrl(
  row: PlaylistRow,
  thumbnailRevisions: Map<string, number>,
  playlistCoverRevisions: Map<string, number>,
): string | null {
  const playlistRevision = playlistCoverRevisions.get(row.id);
  if (row.cover_path && playlistRevision !== undefined) {
    return `/covers/playlists/${row.id}?t=${playlistRevision}`;
  }
  if (row.first_video_id && thumbnailRevisions.has(row.first_video_id)) {
    return `/covers/playlists/${row.id}?t=${thumbnailRevisions.get(row.first_video_id)}`;
  }
  return null;
}

function playlistDto(
  row: PlaylistRow,
  thumbnailRevisions: Map<string, number>,
  playlistCoverRevisions: Map<string, number>,
): PlaylistDto {
  const videoCount = Number(row.video_count);
  const completedCount = Number(row.completed_count);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    authors: stringList(row.authors_json),
    tags: stringList(row.tags_json),
    source: sourceDto(row.source_provider, row.source_url),
    coverUrl: playlistCoverUrl(row, thumbnailRevisions, playlistCoverRevisions),
    videoCount,
    completedCount,
    progressPercent: progressPercent(completedCount, videoCount),
    durationSeconds: Number(row.total_duration),
    nextVideoId: row.next_video_id,
  };
}

function filterDto(row: FilterCountRow): LibraryFilterDto {
  return { name: row.name, count: Number(row.count) };
}

function chapterDto(
  row: ChapterRow,
  videoId: string,
  chapterStarts: Set<number>,
  revision: number | undefined,
): ChapterDto {
  const startSeconds = Number(row.start_seconds);
  return {
    title: row.title,
    startSeconds,
    thumbnailUrl:
      chapterStarts.has(startSeconds) && revision !== undefined
        ? `/covers/videos/${videoId}/chapters/${startSeconds}?t=${revision}`
        : null,
  };
}

export function createLibraryService(
  repository: LibraryRepository,
  settings: LibrarySettings,
  thumbnails?: ThumbnailLookup,
  playlistCovers?: PlaylistCoverLookup,
): LibraryService {
  async function thumbnailIndex(): Promise<ThumbnailLookupIndex> {
    return (
      (await thumbnails?.listThumbnailIndex()) ?? {
        revisions: new Map(),
        chapterStartsByVideo: new Map(),
      }
    );
  }

  async function playlistCoverIndex(): Promise<PlaylistCoverLookupIndex> {
    return (await playlistCovers?.listPlaylistCoverIndex()) ?? { revisions: new Map() };
  }

  async function getPlaylist(
    playlistId: string,
    thumbnailLookup: ThumbnailLookupIndex,
    playlistCoverLookup: PlaylistCoverLookupIndex,
  ): Promise<PlaylistDetailDto | null> {
    const [playlistRow, videoRows] = await Promise.all([
      repository.findPlaylist(playlistId),
      repository.listPlaylistVideos(playlistId),
    ]);
    if (!playlistRow) return null;

    const sectionMap = new Map<string, PlaylistDetailDto["sections"][number]>();
    for (const row of videoRows) {
      const key = row.playlist_section_id ?? "__direct";
      const section = sectionMap.get(key) ?? {
        id: row.playlist_section_id,
        title: row.playlist_section_title ?? "Videos",
        videos: [],
      };
      section.videos.push(videoDto(row, thumbnailLookup));
      sectionMap.set(key, section);
    }
    return {
      ...playlistDto(playlistRow, thumbnailLookup.revisions, playlistCoverLookup.revisions),
      sections: [...sectionMap.values()],
    };
  }

  return {
    async getLibrary(filters) {
      const {
        page: requestedPage = 1,
        pageSize: requestedPageSize,
        view = "videos",
        ...videoFilters
      } = filters ?? {};
      const configuredPageSize = requestedPageSize ?? (await settings.getLibraryPageSize());
      const pageSize = Math.min(100, Math.max(1, configuredPageSize));
      const search = videoFilters.query
        ? {
            query: videoFilters.query,
            page: await repository.searchVideos(
              { ...videoFilters, query: videoFilters.query },
              { limit: pageSize, offset: (Math.max(1, requestedPage) - 1) * pageSize },
            ),
          }
        : null;
      const totalVideos = search?.page.total ?? (await repository.countVideos(videoFilters));
      const totalPages = Math.ceil(totalVideos / pageSize);
      const page = totalPages === 0 ? 1 : Math.min(Math.max(1, requestedPage), totalPages);

      let videoRows: Promise<VideoRow[]>;
      if (!search) {
        videoRows = repository.listVideos(videoFilters, {
          limit: pageSize,
          offset: (page - 1) * pageSize,
        });
      } else if (page === Math.max(1, requestedPage)) {
        videoRows = Promise.resolve(search.page.videos);
      } else {
        videoRows = repository
          .searchVideos(
            { ...videoFilters, query: search.query },
            { limit: pageSize, offset: (page - 1) * pageSize },
          )
          .then((result) => result.videos);
      }

      const [videos, playlists, authors, tags, continuing, thumbnailLookup, playlistCoverLookup] =
        await Promise.all([
          videoRows,
          repository.listPlaylists(videoFilters),
          repository.listAuthors(view),
          repository.listTags(view),
          repository.listContinueWatching(),
          thumbnailIndex(),
          playlistCoverIndex(),
        ]);
      return {
        videos: videos.map((row) => videoDto(row, thumbnailLookup)),
        playlists: playlists.map((row) =>
          playlistDto(row, thumbnailLookup.revisions, playlistCoverLookup.revisions),
        ),
        authors: authors.map(filterDto),
        tags: tags.map(filterDto),
        continueWatching: continuing.map((row) => videoDto(row, thumbnailLookup)),
        pagination: { page, pageSize, totalVideos, totalPages },
      };
    },
    async getVideo(videoId) {
      const [row, thumbnailLookup, playlistCoverLookup] = await Promise.all([
        repository.findVideo(videoId),
        thumbnailIndex(),
        playlistCoverIndex(),
      ]);
      if (!row) return null;
      const [chapters, playlist] = await Promise.all([
        repository.listVideoChapters(videoId),
        row.playlist_id
          ? getPlaylist(row.playlist_id, thumbnailLookup, playlistCoverLookup)
          : Promise.resolve(null),
      ]);
      const starts = new Set(thumbnailLookup.chapterStartsByVideo.get(videoId) ?? []);
      return {
        video: {
          ...videoDto(row, thumbnailLookup),
          coverUrl: videoPosterUrl(videoId, thumbnailLookup.revisions),
          chapters: chapters.map((chapter) =>
            chapterDto(chapter, videoId, starts, thumbnailLookup.revisions.get(videoId)),
          ),
        },
        playlist,
      };
    },
  };
}
