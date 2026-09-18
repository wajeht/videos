// @vitest-environment happy-dom

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, effectScope } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type VideoPlayerDetailDto } from "@/api.js";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import {
  createVideosQueryClient,
  profilesQueryOptions,
  scanStatusQueryOptions,
} from "@/queries.js";

const videoId = "1".repeat(24);

function videoDetail(): VideoPlayerDetailDto {
  return {
    playlist: null,
    video: {
      authors: [],
      chapters: [{ startSeconds: 0, thumbnailUrl: "/covers/chapter.jpg", title: "Start" }],
      completed: false,
      coverUrl: "/covers/poster.jpg",
      description: "",
      durationSeconds: 60,
      id: videoId,
      playlistId: null,
      playlistSectionId: null,
      playlistSectionTitle: null,
      playlistTitle: null,
      positionSeconds: 0,
      progressPercent: 0,
      source: null,
      tags: [],
      title: "Video",
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("useRoutePrefetch", () => {
  it.each([true, false])("prefetches profile data only for admins: %s", async (isAdmin) => {
    const getSettings = vi.spyOn(api, "getSettings");
    const listProfiles = vi.spyOn(api, "listProfiles").mockResolvedValue([]);
    const queryClient = createVideosQueryClient();
    const app = createApp({});
    app.use(VueQueryPlugin, { queryClient });
    const scope = effectScope();
    const prefetch = app.runWithContext(() => scope.run(() => useRoutePrefetch()));
    if (!prefetch) throw new Error("Route prefetch did not initialize");

    await prefetch.settingsProfiles(isAdmin);

    expect(getSettings).not.toHaveBeenCalled();
    expect(listProfiles).toHaveBeenCalledTimes(isAdmin ? 1 : 0);
    if (isAdmin) await queryClient.fetchQuery(profilesQueryOptions());
    expect(listProfiles).toHaveBeenCalledTimes(isAdmin ? 1 : 0);
    scope.stop();
    queryClient.clear();
  });

  it("prefetches reusable library status without starting a scan", async () => {
    const getSettings = vi.spyOn(api, "getSettings");
    const getScanStatus = vi.spyOn(api, "getScanStatus").mockResolvedValue({
      status: "idle",
      startedAt: null,
      completedAt: null,
      playlistCount: 0,
      videoCount: 0,
      warnings: [],
      error: null,
    });
    const rescanLibrary = vi.spyOn(api, "rescanLibrary");
    const queryClient = createVideosQueryClient();
    const app = createApp({});
    app.use(VueQueryPlugin, { queryClient });
    const scope = effectScope();
    const prefetch = app.runWithContext(() => scope.run(() => useRoutePrefetch()));
    if (!prefetch) throw new Error("Route prefetch did not initialize");

    await prefetch.settingsLibrary();

    expect(getSettings).not.toHaveBeenCalled();
    expect(getScanStatus).toHaveBeenCalledOnce();
    await queryClient.fetchQuery(scanStatusQueryOptions());
    expect(getScanStatus).toHaveBeenCalledOnce();
    expect(rescanLibrary).not.toHaveBeenCalled();
    scope.stop();
    queryClient.clear();
  });

  it("loads player images as soon as the prefetched detail is available", async () => {
    vi.spyOn(api, "getVideo").mockResolvedValue(videoDetail());
    const requestedImages: Array<{ image: HTMLImageElement; source: string }> = [];
    vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(
      function (this: HTMLImageElement, source) {
        requestedImages.push({ image: this, source });
      },
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const app = createApp({});
    app.use(VueQueryPlugin, { queryClient });
    const scope = effectScope();
    const prefetch = app.runWithContext(() => scope.run(() => useRoutePrefetch()));
    if (!prefetch) throw new Error("Route prefetch did not initialize");

    await prefetch.video(videoId);

    expect(api.getVideo).toHaveBeenCalledWith(videoId, expect.any(AbortSignal));
    expect(requestedImages.map(({ source }) => source)).toEqual([
      "/covers/poster.jpg",
      "/covers/chapter.jpg",
    ]);
    for (const { image } of requestedImages) image.dispatchEvent(new Event("load"));
    scope.stop();
    queryClient.clear();
  });
});
