// @vitest-environment happy-dom

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authKey } from "@/composables/useAuth.js";
import { api } from "@/api.js";
import { toastKey } from "@/composables/useToast.js";

import LibraryPage from "./LibraryPage.vue";

function mountLibraryPage(profile: { role: "admin" | "member" } | null = { role: "admin" }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(LibraryPage, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      provide: {
        [authKey]: { state: { profile } },
        [toastKey]: { success: vi.fn() },
      },
      stubs: { SettingsLayout: { template: "<slot />" } },
    },
  });
}

describe("settings/LibraryPage", () => {
  beforeEach(() => {
    vi.spyOn(api, "getScanStatus").mockResolvedValue({
      completedAt: "2026-08-12T00:00:00.000Z",
      playlistCount: 12,
      error: null,
      videoCount: 215,
      startedAt: "2026-08-12T00:00:00.000Z",
      status: "complete",
      warnings: [],
    });
    vi.spyOn(api, "rescanLibrary").mockResolvedValue({
      status: "idle",
      startedAt: null,
      completedAt: null,
      playlistCount: 0,
      videoCount: 0,
      warnings: [],
      error: null,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([null, { role: "member" as const }])(
    "shows library status without a refresh button for non-admins: %j",
    async (profile) => {
      const wrapper = mountLibraryPage(profile);
      await flushPromises();
      expect(wrapper.get("#settings-library-panel").text()).toContain("12 playlists · 215 videos");
      expect(wrapper.get("legend h2").text()).toBe("Refresh library");
      expect(wrapper.find("button").exists()).toBe(false);
      expect(api.getScanStatus).toHaveBeenCalledOnce();
      expect(api.rescanLibrary).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it("shows placeholders until the library status loads", async () => {
    let resolveScanStatus!: (value: Awaited<ReturnType<typeof api.getScanStatus>>) => void;
    vi.mocked(api.getScanStatus).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveScanStatus = resolve;
      }),
    );
    const wrapper = mountLibraryPage();

    const statusGrid = wrapper.get('[aria-busy="true"]');
    expect(statusGrid.text()).toContain("Loading library status");
    expect(statusGrid.get("[data-library-status-skeleton]").attributes("aria-hidden")).toBe("true");
    expect(statusGrid.get("[data-last-refresh-skeleton]").attributes("aria-hidden")).toBe("true");
    expect(statusGrid.get("[data-last-refresh]").text()).toContain("Last refreshed");

    resolveScanStatus({
      completedAt: "2026-08-12T00:00:00.000Z",
      playlistCount: 12,
      error: null,
      videoCount: 215,
      startedAt: "2026-08-12T00:00:00.000Z",
      status: "complete",
      warnings: [],
    });
    await flushPromises();

    expect(wrapper.find("[data-library-status-skeleton]").exists()).toBe(false);
    expect(wrapper.find("[data-last-refresh-skeleton]").exists()).toBe(false);
    expect(wrapper.get("[data-library-status]").text()).toContain("12 playlists · 215 videos");
    expect(wrapper.get("[data-last-refresh]").get("time").text()).not.toBe("");
  });

  it("renders library status without display settings", async () => {
    const wrapper = mountLibraryPage();
    await flushPromises();

    const refreshCard = wrapper.get("#settings-library-panel > fieldset");
    expect(refreshCard.get("legend h2").text()).toBe("Refresh library");
    expect(refreshCard.text()).toContain("12 playlists · 215 videos");
    expect(refreshCard.get("[data-scan-controls]").classes()).toContain("flex-col");
    expect(wrapper.get("#settings-library-panel").text()).not.toContain("Videos per page");
    expect(wrapper.get("#settings-library-panel").classes()).toEqual(
      expect.arrayContaining(["grid", "gap-[clamp(18px,2vw,30px)]"]),
    );
    const lastRefresh = refreshCard.get('time[datetime="2026-08-12T00:00:00.000Z"]');
    expect(lastRefresh.element.parentElement?.textContent).toContain("Last refreshed");
    expect(lastRefresh.text()).not.toBe("");
  });

  it("shows actionable library issue details with correct singular wording", async () => {
    vi.mocked(api.getScanStatus).mockResolvedValueOnce({
      completedAt: "2026-08-12T00:00:00.000Z",
      playlistCount: 1,
      error: null,
      videoCount: 1,
      startedAt: "2026-08-12T00:00:00.000Z",
      status: "complete",
      warnings: [{ path: "Example/playlist.json", message: "Cover file is missing" }],
    });
    const wrapper = mountLibraryPage();
    await flushPromises();

    const issues = wrapper.get('[aria-label="Library issues"]');
    expect(wrapper.text()).toContain("1 library issue");
    expect(issues.text()).toContain("Example/playlist.json");
    expect(issues.text()).toContain("Cover file is missing");
  });

  it("shows a failed refresh without exposing its technical error or stale counts", async () => {
    vi.mocked(api.getScanStatus).mockResolvedValueOnce({
      completedAt: "2026-08-12T00:00:00.000Z",
      playlistCount: 12,
      error: "Video folder is unavailable",
      videoCount: 215,
      startedAt: "2026-08-12T00:00:00.000Z",
      status: "failed",
      warnings: [],
    });
    const wrapper = mountLibraryPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Refresh failed");
    expect(wrapper.text()).toContain(
      "The library could not be refreshed. Check that your video folder is available, then try again.",
    );
    expect(wrapper.text()).not.toContain("Video folder is unavailable");
    expect(wrapper.text()).not.toContain("12 playlists · 215 videos");
  });

  it("shows an unavailable status instead of a loading status after a request fails", async () => {
    vi.mocked(api.getScanStatus).mockRejectedValueOnce(new Error("Could not load library status"));
    const wrapper = mountLibraryPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Could not load library status");
    expect(wrapper.text()).toContain("Library status unavailable");
    expect(wrapper.text()).not.toContain("Library status is loading…");
  });

  it("disables refresh while the library is already refreshing", async () => {
    vi.mocked(api.getScanStatus).mockResolvedValueOnce({
      completedAt: null,
      playlistCount: 0,
      error: null,
      videoCount: 0,
      startedAt: "2026-08-12T00:00:00.000Z",
      status: "scanning",
      warnings: [],
    });
    const wrapper = mountLibraryPage();
    await flushPromises();

    const refreshButton = wrapper.get('button[aria-busy="true"]');
    expect(refreshButton.attributes()).toHaveProperty("disabled");
    expect(refreshButton.text()).toContain("Refreshing…");

    await refreshButton.trigger("click");
    expect(api.rescanLibrary).not.toHaveBeenCalled();
  });
});
