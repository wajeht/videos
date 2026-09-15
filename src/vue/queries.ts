import { keepPreviousData, QueryClient, queryOptions } from "@tanstack/vue-query";

import {
  api,
  type LibraryDto,
  type LibraryFilters,
  type ScanStatus,
  type SettingsDto,
  type VideoPlayerDetailDto,
} from "@/api.js";

export interface LibraryQueryClient {
  getLibrary(filters?: LibraryFilters, signal?: AbortSignal): Promise<LibraryDto>;
  getScanStatus(signal?: AbortSignal): Promise<ScanStatus>;
}

export const queryKeys = {
  library: ["library"] as const,
  libraryList: (filters: LibraryFilters) => ["library", "list", filters] as const,
  videos: ["videos"] as const,
  video: (videoId: string) => ["videos", videoId] as const,
  scanStatus: ["scan-status"] as const,
  settings: ["settings"] as const,
  profiles: ["profiles"] as const,
};

export function createVideosQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export function libraryQueryOptions(
  filters: LibraryFilters,
  client: Pick<LibraryQueryClient, "getLibrary"> = api,
) {
  const normalizedFilters = { ...filters, page: filters.page ?? 1 };
  return queryOptions({
    queryKey: queryKeys.libraryList(normalizedFilters),
    queryFn: ({ signal }) => client.getLibrary(normalizedFilters, signal),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function videoSearchQueryOptions(
  query: string,
  active: boolean,
  client: Pick<LibraryQueryClient, "getLibrary"> = api,
) {
  const normalizedQuery = query.trim();
  return queryOptions({
    ...libraryQueryOptions({ query: normalizedQuery, pageSize: 20 }, client),
    enabled: active && normalizedQuery.length >= 2,
    placeholderData: undefined,
  });
}

export function videoQueryOptions(videoId: string) {
  return queryOptions({
    queryKey: queryKeys.video(videoId),
    queryFn: ({ signal }): Promise<VideoPlayerDetailDto> => api.getVideo(videoId, signal),
    staleTime: 5 * 60_000,
  });
}

export function scanStatusQueryOptions(client: Pick<LibraryQueryClient, "getScanStatus"> = api) {
  return queryOptions({
    queryKey: queryKeys.scanStatus,
    queryFn: ({ signal }) => client.getScanStatus(signal),
  });
}

export function settingsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.settings,
    queryFn: ({ signal }): Promise<SettingsDto> => api.getSettings(signal),
    staleTime: Infinity,
  });
}

export function profilesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.profiles,
    queryFn: ({ signal }) => api.listProfiles(signal),
  });
}
