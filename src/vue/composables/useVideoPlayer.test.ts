// @vitest-environment happy-dom

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, shallowRef } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  setProfileSession,
  ApiError,
  type PlaybackResult,
  type PlaylistDetailDto,
  type VideoDetailDto,
  type VideoPlayerDetailDto,
} from "@/api.js";
import { confirmationKey, createConfirmation } from "@/composables/useConfirm.js";
import { createToast, toastKey } from "@/composables/useToast.js";
import { useVideoPlayer } from "@/composables/useVideoPlayer.js";

const playlistId = "1".repeat(24);
const videoId = "2".repeat(24);
const video: VideoDetailDto = {
  authors: [],
  chapters: [],
  completed: false,
  coverUrl: null,
  description: "",
  durationSeconds: 120,
  id: videoId,
  playlistId,
  playlistSectionId: null,
  playlistSectionTitle: null,
  playlistTitle: "Saved Collection",
  positionSeconds: 30,
  progressPercent: 25,
  source: null,
  tags: [],
  title: "Example video",
};
const playlist: PlaylistDetailDto = {
  authors: [],
  completedCount: 0,
  coverUrl: null,
  description: "",
  durationSeconds: 120,
  id: playlistId,
  nextVideoId: videoId,
  progressPercent: 25,
  sections: [{ id: null, title: "Videos", videos: [video] }],
  source: null,
  tags: [],
  title: "Saved Collection",
  videoCount: 1,
};

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

beforeEach(() => {
  setProfileSession("test-profile", "test-selection");
  vi.stubGlobal("localStorage", createStorage());
});
afterEach(() => vi.restoreAllMocks());

interface MountPlayerOptions {
  getVideo?: (id: string, signal?: AbortSignal) => Promise<VideoPlayerDetailDto>;
  preparePlayback?: (id: string) => Promise<PlaybackResult>;
  regenerateVideoThumbnail?: (id: string, signal?: AbortSignal) => Promise<void>;
}

async function mountPlayer(options: MountPlayerOptions & { path?: string } = {}) {
  vi.spyOn(api, "getVideo").mockImplementation(
    options.getVideo ?? (async () => ({ video: { ...video }, playlist })),
  );
  vi.spyOn(api, "preparePlayback").mockImplementation(
    options.preparePlayback ?? (async () => ({ kind: "direct" as const, url: "/media/video" })),
  );
  vi.spyOn(api, "regenerateVideoThumbnail").mockImplementation(
    options.regenerateVideoThumbnail ?? (async () => undefined),
  );
  vi.spyOn(api, "openVideo").mockResolvedValue();
  vi.spyOn(api, "completeVideo").mockResolvedValue();

  const media = document.createElement("video");
  Object.defineProperties(media, {
    currentTime: { configurable: true, value: 30, writable: true },
    duration: { configurable: true, value: 120 },
    readyState: { configurable: true, value: 1 },
  });
  vi.spyOn(media, "canPlayType").mockReturnValue("");
  vi.spyOn(media, "load").mockImplementation(() => undefined);
  vi.spyOn(media, "pause").mockImplementation(() => undefined);
  vi.spyOn(media, "play").mockResolvedValue();
  vi.spyOn(media, "removeAttribute");
  const component = defineComponent({
    setup() {
      return { player: useVideoPlayer(shallowRef(media)) };
    },
    template: `
      <p data-video-title>{{ player.video.value?.title }}</p>
      <p data-playlist-id>{{ player.playlist.value?.id ?? "" }}</p>
      <p data-playlist-loading>{{ player.playlistLoading.value }}</p>
      <p data-poster>{{ player.posterUrl.value ?? "" }}</p>
      <p data-autoplay>{{ player.autoplayNext.value }}</p>
      <button data-autoplay-toggle @click="player.setAutoplayNext(!player.autoplayNext.value)">
        Toggle autoplay
      </button>
      <button data-complete @click="player.markComplete">Complete video</button>
      <button data-regenerate @click="player.regenerateThumbnail">Regenerate thumbnail</button>
      <button data-reset-video @click="player.resetProgress">Reset video</button>
      <button data-reset-playlist @click="player.resetPlaylistProgress">Reset playlist</button>
    `,
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/videos/:videoId", name: "player", component },
      { path: "/:pathMatch(.*)*", name: "not-found", component: { template: "<div />" } },
    ],
  });
  await router.push(options.path ?? `/videos/${videoId}`);
  await router.isReady();
  const confirmation = createConfirmation();
  const toast = createToast();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = mount(component, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
      provide: { [confirmationKey]: confirmation, [toastKey]: toast },
    },
  });
  await flushPromises();
  return { confirmation, media, router, toast, wrapper };
}

describe("useVideoPlayer", () => {
  it.each([
    { query: "", pending: false, loadedId: "" },
    { query: `?list=${playlistId}`, pending: true, loadedId: playlistId },
    { query: "?list=other", pending: true, loadedId: "" },
    { query: "?list=", pending: false, loadedId: "" },
    { query: `?list=${playlistId}&list=other`, pending: false, loadedId: "" },
  ])("reserves playlist loading space for $query", async ({ query, pending, loadedId }) => {
    let resolveDetail!: (detail: VideoPlayerDetailDto) => void;
    const detail = new Promise<VideoPlayerDetailDto>((resolve) => {
      resolveDetail = resolve;
    });
    const { wrapper } = await mountPlayer({
      path: `/videos/${videoId}${query}`,
      getVideo: async () => detail,
    });

    expect(wrapper.get("[data-playlist-loading]").text()).toBe(String(pending));
    expect(wrapper.get("[data-playlist-id]").text()).toBe("");

    resolveDetail({ video: { ...video }, playlist });
    await flushPromises();

    expect(wrapper.get("[data-playlist-loading]").text()).toBe("false");
    expect(wrapper.get("[data-playlist-id]").text()).toBe(loadedId);
    wrapper.unmount();
  });

  it("persists the autoplay preference", async () => {
    const { wrapper } = await mountPlayer();

    expect(wrapper.get("[data-autoplay]").text()).toBe("false");

    await wrapper.get("[data-autoplay-toggle]").trigger("click");

    expect(wrapper.get("[data-autoplay]").text()).toBe("true");
    expect(localStorage.getItem("videos:test-profile:autoplay-next")).toBe("true");

    await wrapper.get("[data-autoplay-toggle]").trigger("click");

    expect(wrapper.get("[data-autoplay]").text()).toBe("false");
    expect(localStorage.getItem("videos:test-profile:autoplay-next")).toBeNull();
    wrapper.unmount();
  });

  it("plays the next playlist video after completing the current one when autoplay is on", async () => {
    const nextVideoId = "3".repeat(24);
    const nextVideo: VideoDetailDto = { ...video, id: nextVideoId, title: "Next video" };
    const twoVideoPlaylist: PlaylistDetailDto = {
      ...playlist,
      durationSeconds: 240,
      sections: [{ id: null, title: "Videos", videos: [video, nextVideo] }],
      videoCount: 2,
    };
    const { media, router, wrapper } = await mountPlayer({
      path: `/videos/${videoId}?list=${playlistId}`,
      getVideo: async (id) => ({
        video: { ...(id === videoId ? video : nextVideo) },
        playlist: twoVideoPlaylist,
      }),
    });

    await wrapper.get("[data-autoplay-toggle]").trigger("click");
    await wrapper.get("[data-complete]").trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.params.videoId).toBe(nextVideoId));
    await flushPromises();

    expect(router.currentRoute.value.query.list).toBe(playlistId);
    expect(media.autoplay).toBe(true);
    expect(media.play).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("uses the thumbnail for the chapter containing the resume position", async () => {
    const { wrapper } = await mountPlayer({
      getVideo: async () => ({
        video: {
          ...video,
          coverUrl: "/covers/video",
          positionSeconds: 95,
          chapters: [
            { title: "Introduction", startSeconds: 0, thumbnailUrl: "/covers/chapter-0" },
            { title: "Technique", startSeconds: 90, thumbnailUrl: "/covers/chapter-90" },
          ],
        },
        playlist,
      }),
    });

    expect(wrapper.get("[data-poster]").text()).toBe("/covers/chapter-90");
    wrapper.unmount();
  });

  it("refreshes the current video after regenerating its thumbnails", async () => {
    let requestCount = 0;
    const { toast, wrapper } = await mountPlayer({
      getVideo: async () => {
        const initialRequest = requestCount++ === 0;
        return {
          video: {
            ...video,
            coverUrl: initialRequest ? "/covers/old" : "/covers/new",
            title: initialRequest ? "Example video" : "Updated video",
          },
          playlist,
        };
      },
    });

    await wrapper.get("[data-regenerate]").trigger("click");
    await flushPromises();

    expect(api.regenerateVideoThumbnail).toHaveBeenCalledWith(videoId, expect.any(AbortSignal));
    expect(wrapper.get("[data-video-title]").text()).toBe("Updated video");
    expect(toast.toasts.value).toContainEqual(
      expect.objectContaining({ kind: "success", message: "Thumbnails updated" }),
    );
    wrapper.unmount();
  });

  it("cancels thumbnail polling when the player route changes", async () => {
    const nextVideoId = "3".repeat(24);
    let regenerationSignal: AbortSignal | undefined;
    const { router, toast, wrapper } = await mountPlayer({
      getVideo: async (id) => ({
        video: { ...video, id, title: id === videoId ? video.title : "Next video" },
        playlist: id === videoId ? playlist : null,
      }),
      regenerateVideoThumbnail: async (_id, signal) => {
        regenerationSignal = signal;
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    });

    await wrapper.get("[data-regenerate]").trigger("click");
    await vi.waitFor(() => expect(regenerationSignal).toBeInstanceOf(AbortSignal));
    await router.push(`/videos/${nextVideoId}`);
    await vi.waitFor(() => expect(regenerationSignal?.aborted).toBe(true));
    await flushPromises();

    expect(toast.toasts.value).toEqual([]);
    expect(wrapper.get("[data-video-title]").text()).toBe("Next video");
    wrapper.unmount();
  });

  it("cancels thumbnail polling when the player unmounts", async () => {
    let regenerationSignal: AbortSignal | undefined;
    const { toast, wrapper } = await mountPlayer({
      regenerateVideoThumbnail: async (_id, signal) => {
        regenerationSignal = signal;
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    });

    await wrapper.get("[data-regenerate]").trigger("click");
    await vi.waitFor(() => expect(regenerationSignal).toBeInstanceOf(AbortSignal));
    wrapper.unmount();
    await vi.waitFor(() => expect(regenerationSignal?.aborted).toBe(true));
    await flushPromises();

    expect(toast.toasts.value).toEqual([]);
  });

  it("reports a failed video progress reset", async () => {
    vi.spyOn(api, "resetVideo").mockRejectedValue(new ApiError("Video reset failed", 500));
    const { confirmation, toast, wrapper } = await mountPlayer();

    await wrapper.get("[data-reset-video]").trigger("click");
    confirmation.accept();
    await flushPromises();

    expect(toast.toasts.value).toEqual([
      expect.objectContaining({ kind: "error", message: "Video reset failed" }),
    ]);
    wrapper.unmount();
  });

  it("reports a failed playlist progress reset", async () => {
    vi.spyOn(api, "resetPlaylist").mockRejectedValue(new ApiError("Playlist reset failed", 500));
    const { confirmation, toast, wrapper } = await mountPlayer({
      path: `/videos/${videoId}?list=${playlistId}`,
    });

    await wrapper.get("[data-reset-playlist]").trigger("click");
    confirmation.accept();
    await flushPromises();

    expect(toast.toasts.value).toEqual([
      expect.objectContaining({ kind: "error", message: "Playlist reset failed" }),
    ]);
    wrapper.unmount();
  });

  it("shows playlist context only when the list query matches", async () => {
    const { router, wrapper } = await mountPlayer();

    expect(wrapper.get("[data-playlist-id]").text()).toBe("");

    await router.replace({ query: { list: playlistId } });
    await flushPromises();

    expect(wrapper.get("[data-playlist-id]").text()).toBe(playlistId);
    expect(api.getVideo).toHaveBeenCalledTimes(1);

    await router.replace({ query: { list: "9".repeat(24) } });
    await flushPromises();

    expect(wrapper.get("[data-playlist-id]").text()).toBe("");
    expect(api.getVideo).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("keeps the latest video when the same route changes", async () => {
    const nextVideoId = "3".repeat(24);
    const nextVideo: VideoDetailDto = {
      ...video,
      id: nextVideoId,
      playlistId: null,
      playlistTitle: null,
      title: "Next video",
    };
    let resolveInitialVideo!: (detail: VideoPlayerDetailDto) => void;
    const initialVideo = new Promise<VideoPlayerDetailDto>((resolve) => {
      resolveInitialVideo = resolve;
    });
    const getVideo = vi.fn(async (id: string) => {
      if (id === videoId) return initialVideo;
      return { video: nextVideo, playlist: null };
    });
    const preparePlayback = vi.fn(async (id: string): Promise<PlaybackResult> => ({
      kind: "direct",
      url: `/media/${id}`,
    }));
    const { media, router, wrapper } = await mountPlayer({ getVideo, preparePlayback });

    await vi.waitFor(() => expect(getVideo).toHaveBeenCalledWith(videoId, expect.any(AbortSignal)));
    await router.push(`/videos/${nextVideoId}`);
    await vi.waitFor(() => expect(wrapper.get("[data-video-title]").text()).toBe("Next video"));

    resolveInitialVideo({ video: { ...video, title: "First video" }, playlist });
    await flushPromises();

    expect(wrapper.get("[data-video-title]").text()).toBe("Next video");
    expect(media.getAttribute("src")).toBe(`/media/${nextVideoId}`);
    expect(api.openVideo).toHaveBeenCalledTimes(1);
    expect(api.openVideo).toHaveBeenCalledWith(nextVideoId, "test-selection");
    wrapper.unmount();
  });
});
