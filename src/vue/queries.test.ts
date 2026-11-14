import { describe, expect, it } from "vitest";

import type { LibraryDto } from "@/api.js";
import {
  createVideosQueryClient,
  libraryQueryOptions,
  settingsQueryOptions,
  videoSearchQueryOptions,
} from "@/queries.js";

function library(): LibraryDto {
  return {
    videos: [],
    playlists: [],
    authors: [],
    tags: [],
    continueWatching: [],
    pagination: { page: 1, pageSize: 24, totalVideos: 0, totalPages: 0 },
  };
}

describe("videos query client", () => {
  it("reuses equivalent fresh library data", async () => {
    let requests = 0;
    const client = {
      async getLibrary() {
        requests++;
        return library();
      },
    };
    const queryClient = createVideosQueryClient();
    await queryClient.fetchQuery(libraryQueryOptions({}, client));
    await queryClient.fetchQuery(libraryQueryOptions({ page: 1 }, client));
    expect(requests).toBe(1);
    queryClient.clear();
  });

  it("keeps settings fresh until explicitly updated", () => {
    expect(settingsQueryOptions().staleTime).toBe(Infinity);
  });

  it("reuses the normalized global search query", async () => {
    const requests: string[] = [];
    const client = {
      async searchVideos(query: string) {
        requests.push(query);
        return [];
      },
    };
    const queryClient = createVideosQueryClient();

    await queryClient.fetchQuery(videoSearchQueryOptions("  memory  ", true, client));
    await queryClient.fetchQuery(videoSearchQueryOptions("memory", true, client));

    expect(requests).toEqual(["memory"]);
    expect(videoSearchQueryOptions("m", true, client).enabled).toBe(false);
    expect(videoSearchQueryOptions("memory", false, client).enabled).toBe(false);
    queryClient.clear();
  });
});
