// @vitest-environment happy-dom

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type LibraryDto } from "@/api.js";

import VideoSearchPalette from "./VideoSearchPalette.vue";

const videoId = "2".repeat(24);
const wrappers: VueWrapper[] = [];

function dialogElement<T extends Element>(selector: string): DOMWrapper<T> {
  const element = document.body.querySelector<T>(selector);
  if (!element) throw new Error(`Missing dialog element: ${selector}`);
  return new DOMWrapper(element);
}

function library(videos: LibraryDto["videos"] = [video()]): LibraryDto {
  return {
    authors: [],
    continueWatching: [],
    pagination: { page: 1, pageSize: 20, totalPages: 1, totalVideos: videos.length },
    playlists: [],
    tags: [],
    videos,
  };
}

function video(): LibraryDto["videos"][number] {
  return {
    authors: ["Example Author"],
    completed: false,
    coverUrl: "/covers/memory.jpg",
    description: "",
    durationSeconds: 120,
    id: videoId,
    playlistId: "3".repeat(24),
    playlistSectionId: null,
    playlistSectionTitle: null,
    playlistTitle: "Example Playlist",
    positionSeconds: 30,
    progressPercent: 25,
    source: null,
    tags: [],
    title: "Memory optimization",
  };
}

async function mountPalette(response = library()) {
  vi.spyOn(api, "getLibrary").mockResolvedValue(response);
  vi.spyOn(api, "getVideo").mockResolvedValue({
    playlist: null,
    video: { ...video(), chapters: [] },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "home", component: { template: "<div />" } },
      { path: "/videos", name: "videos", component: { template: "<div />" } },
      { path: "/videos/:videoId", name: "player", component: { template: "<div />" } },
    ],
  });
  await router.push("/");
  await router.isReady();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = mount(VideoSearchPalette, {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient }], router] },
  });
  wrappers.push(wrapper);
  return { router, wrapper };
}

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.length = 0;
  vi.restoreAllMocks();
});

describe("VideoSearchPalette", () => {
  it("shows every result returned by the search page", async () => {
    const videos = Array.from({ length: 20 }, (_, index) => ({
      ...video(),
      id: (index + 1).toString(16).padStart(24, "0"),
      title: `Result ${index + 1}`,
    }));
    await mountPalette(library(videos));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    await dialogElement<HTMLInputElement>(
      'input[aria-label="Search videos, authors, playlists, and tags"]',
    ).setValue("result");

    await vi.waitFor(() =>
      expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(20),
    );
    expect(document.body.textContent).toContain("Result 20");
  });

  it("opens with Command K and shows matching video titles", async () => {
    await mountPalette();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(document.body.querySelector("dialog[open]")).toBeTruthy();
    expect(document.body.textContent).toContain("Find videos by title, author, playlist, or tag.");

    await dialogElement<HTMLInputElement>(
      'input[aria-label="Search videos, authors, playlists, and tags"]',
    ).setValue("memory");

    await vi.waitFor(() => expect(document.body.textContent).toContain("Memory optimization"));
    expect(dialogElement<HTMLElement>("mark").text()).toBe("Memory");
    expect(document.body.textContent).toContain("Example Author");
    expect(document.body.textContent).toContain("Example Playlist");
    expect(document.body.textContent).toContain("2:00");
    expect(document.body.textContent).toContain("Video progress: 25%");
    expect(document.body.querySelector('img[src="/covers/memory.jpg"]')).toBeTruthy();
    const selected = dialogElement<HTMLElement>('[role="option"]');
    expect(selected.attributes("aria-selected")).toBe("false");
    expect(selected.attributes("aria-label")).toBe(
      "Memory optimization, Example Author · Example Playlist, 2m, 25% watched",
    );
    expect(api.getLibrary).toHaveBeenCalledWith(
      { page: 1, pageSize: 20, query: "memory" },
      expect.any(AbortSignal),
    );

    expect(api.getVideo).not.toHaveBeenCalled();

    await dialogElement<HTMLInputElement>(
      'input[aria-label="Search videos, authors, playlists, and tags"]',
    ).trigger("keydown", { key: "ArrowDown" });
    expect(selected.attributes("aria-selected")).toBe("true");
    await vi.waitFor(() =>
      expect(api.getVideo).toHaveBeenCalledWith(videoId, expect.any(AbortSignal)),
    );
  });

  it("highlights the intended title word for a fuzzy typo match", async () => {
    await mountPalette();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    await dialogElement<HTMLInputElement>(
      'input[aria-label="Search videos, authors, playlists, and tags"]',
    ).setValue("memroy");

    await vi.waitFor(() => expect(dialogElement<HTMLElement>("mark").text()).toBe("Memory"));
  });

  it("sends a query without matches to the Videos page", async () => {
    const { router } = await mountPalette(library([]));
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    const input = dialogElement<HTMLInputElement>(
      'input[aria-label="Search videos, authors, playlists, and tags"]',
    );
    await input.setValue("memory optimization");
    await vi.waitFor(() => expect(document.body.textContent).toContain("No matching videos"));
    expect(document.body.textContent).toContain("View all results");

    await dialogElement<HTMLFormElement>("dialog form").trigger("submit");
    await flushPromises();

    expect(router.currentRoute.value).toMatchObject({
      name: "videos",
      query: { q: "memory optimization" },
    });
  });

  it("opens a selected video with the keyboard", async () => {
    const { router } = await mountPalette();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    const input = dialogElement<HTMLInputElement>(
      'input[aria-label="Search videos, authors, playlists, and tags"]',
    );
    await input.setValue("memory");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Memory optimization"));

    await input.trigger("keydown", { key: "ArrowDown" });
    const selected = dialogElement<HTMLElement>('[role="option"][aria-selected="true"]');
    expect(selected.text()).toContain("01");
    await vi.waitFor(() =>
      expect(api.getVideo).toHaveBeenCalledWith(videoId, expect.any(AbortSignal)),
    );
    await dialogElement<HTMLFormElement>("dialog form").trigger("submit");
    await flushPromises();

    expect(router.currentRoute.value).toMatchObject({
      name: "player",
      params: { videoId },
      query: { list: "3".repeat(24) },
    });
  });
});
