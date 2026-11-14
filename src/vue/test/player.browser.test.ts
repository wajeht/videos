import { readFile } from "node:fs/promises";
import { selectBrowserAdmin, setupBrowserAdmin } from "./profiles.helpers.js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type {
  PlaybackResult,
  PlaylistDetailDto,
  PlaylistVideoDto,
  VideoDetailDto,
} from "../api.js";

const videoId = "c".repeat(24);
const playlistId = "d".repeat(24);
const shortDescriptionVideoId = "e".repeat(24);

async function authenticate(page: Page): Promise<void> {
  const password = "playwright-password";
  const setup = await page.request.post("/api/auth/password", {
    data: {
      password,
      confirmPassword: password,
      setupToken: "videos-playwright-setup-token",
    },
  });
  expect([201, 409]).toContain(setup.status());
  expect((await page.request.post("/api/auth", { data: { password } })).status()).toBe(200);
  await setupBrowserAdmin(page);
  await selectBrowserAdmin(page);
}

async function expectPlaylistLoadingLayout(
  page: Page,
  releaseDetail: () => void,
  releasePlayback: () => void,
  videoTitle: string,
): Promise<void> {
  const loadingPlaylist = page.getByRole("complementary", { name: "Loading playlist…" });
  const loadingDetails = page.getByRole("region", { name: "Video details" });
  const loadingFrames = new Map<number, { x: number; width: number }>();
  for (const width of [1800, 1000, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(loadingPlaylist).toBeVisible();
    await expect(loadingDetails).toBeVisible();
    await expect(page.getByText("Preparing video…", { exact: true })).toBeVisible();
    await expect(loadingPlaylist.getByRole("button")).toHaveCount(0);
    const frame = await page.locator("video").boundingBox();
    const sidebar = await loadingPlaylist.boundingBox();
    expect(frame).not.toBeNull();
    expect(sidebar).not.toBeNull();
    loadingFrames.set(width, { x: frame!.x, width: frame!.width });
    if (width > 860) expect(sidebar!.x).toBeGreaterThan(frame!.x + frame!.width);
    else expect(sidebar!.y).toBeGreaterThan(frame!.y + frame!.height);
  }
  releaseDetail();
  await expect(loadingPlaylist).toBeVisible();
  releasePlayback();
  await expect(page.getByRole("heading", { name: videoTitle })).toBeVisible();
  await expect(loadingPlaylist).toHaveCount(0);
  await expect(loadingDetails).toHaveCount(0);
  for (const [width, loadingFrame] of loadingFrames) {
    await page.setViewportSize({ width, height: 900 });
    const frame = await page.locator("video").boundingBox();
    expect(frame!.x).toBeCloseTo(loadingFrame.x, 0);
    expect(frame!.width).toBeCloseTo(loadingFrame.width, 0);
  }
  await page.setViewportSize({ width: 1800, height: 900 });
}

async function expectPlaylistRowLayout(
  page: Page,
  playlistPanel: Locator,
  videoTitle: string,
): Promise<void> {
  const duration = playlistPanel.getByText("17:57", { exact: true });
  const progress = playlistPanel.getByText("100%", { exact: true });
  for (const width of [1800, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(duration).toBeVisible();
    expect(
      await duration.evaluate((element) => {
        const badge = element.getBoundingClientRect();
        const thumbnail = element.parentElement!.getBoundingClientRect();
        return (
          badge.left > thumbnail.left &&
          badge.right < thumbnail.right &&
          badge.top > thumbnail.top &&
          badge.bottom < thumbnail.bottom &&
          badge.height < thumbnail.height / 2
        );
      }),
    ).toBe(true);
    await expect(progress).toBeVisible();
    expect(
      await progress.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = range.getBoundingClientRect();
        const row = element.closest("a")!.getBoundingClientRect();
        const status = element.parentElement!.getBoundingClientRect();
        return text.left >= status.left && text.right <= Math.min(status.right, row.right - 8);
      }),
    ).toBe(true);
    expect(
      await page.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
  const title = playlistPanel.getByText(videoTitle, { exact: true });
  await expect(title).toBeVisible();
  expect(await title.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1800, height: 900 });
}

test("uses responsive video details and places the playlist below them on mobile", async ({
  page,
}) => {
  await authenticate(page);

  const videoTitle = "Basics of computer's memory and Getting started - C Programming Tutorial 02";
  const playlistVideo = {
    completed: false,
    coverUrl: null,
    durationSeconds: 1077,
    id: videoId,
    playlistId,
    positionSeconds: 1076.75,
    progressPercent: 100,
    title: videoTitle,
  } satisfies PlaylistVideoDto;
  const video: VideoDetailDto = {
    ...playlistVideo,
    authors: ["Example Author"],
    chapters: [
      { startSeconds: 0, title: "Introduction", thumbnailUrl: null },
      { startSeconds: 90, title: "Computer memory", thumbnailUrl: null },
      { startSeconds: 180, title: "Pointers", thumbnailUrl: null },
      { startSeconds: 270, title: "Summary", thumbnailUrl: null },
    ],
    description:
      "A complete introduction to programming, computer memory, and the ideas used throughout this playlist.",
    playlistSectionId: null,
    playlistSectionTitle: null,
    playlistTitle: "Saved Collection",
    source: null,
    tags: [],
  };

  let releaseDetail!: () => void;
  let detailReady = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  let playbackReady = Promise.resolve();
  await page.route(`**/api/videos/${videoId}`, async (route) => {
    await detailReady;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        video,
        playlist: {
          authors: ["Example Author"],
          completedCount: 0,
          coverUrl: null,
          description: "",
          durationSeconds: video.durationSeconds,
          id: playlistId,
          nextVideoId: videoId,
          progressPercent: 0,
          sections: [{ id: null, title: "Videos", videos: [playlistVideo] }],
          source: null,
          tags: [],
          title: "Saved Collection",
          videoCount: 1,
        },
      }),
    });
  });
  await page.route(`**/api/playback/${videoId}`, async (route) => {
    await playbackReady;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ kind: "direct", url: "/media/example.mp4" }),
    });
  });
  await page.route(`**/api/progress/videos/${videoId}/open`, async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({}) });
  });
  await page.route("**/media/example.mp4", async (route) => {
    await route.fulfill({ contentType: "video/mp4", body: "" });
  });

  await page.setViewportSize({ width: 1800, height: 900 });
  const title = page.getByRole("heading", { name: videoTitle });
  const playlistPanel = page.getByRole("complementary", { name: "Saved Collection" });
  const playlistActions = page.getByRole("button", { name: "Playlist actions" });
  const autoplay = page.getByRole("menuitemcheckbox", { name: /Autoplay next video/ });

  await page.goto(`/videos/${videoId}`);
  const loadingDetails = page.getByRole("region", { name: "Video details" });
  await expect(loadingDetails).toBeVisible();
  await expect(loadingDetails).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Video actions" })).toHaveCount(0);
  releaseDetail();
  await expect(title).toBeVisible();
  await expect(loadingDetails).toHaveCount(0);
  await expect(playlistPanel).toHaveCount(0);

  let releasePlayback!: () => void;
  detailReady = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  playbackReady = new Promise<void>((resolve) => {
    releasePlayback = resolve;
  });
  await page.goto(`/videos/${videoId}?list=${playlistId}`);
  await expectPlaylistLoadingLayout(page, releaseDetail, releasePlayback, videoTitle);
  const clippedVideoPixels = await page.locator("video").evaluate((element) => {
    const videoBounds = element.getBoundingClientRect();
    const frameBounds = element.parentElement?.getBoundingClientRect();

    return frameBounds ? Math.max(0, Math.ceil(videoBounds.bottom - frameBounds.bottom)) : 0;
  });
  expect(clippedVideoPixels).toBe(0);
  expect((await title.boundingBox())?.width).toBeGreaterThan(1000);
  const playlistVideos = playlistPanel.locator(":scope > div");
  await expect(playlistPanel).toBeVisible();
  await expectPlaylistRowLayout(page, playlistPanel, videoTitle);
  await playlistActions.click();
  await expect(autoplay).toBeVisible();
  await expect(autoplay).toHaveAttribute("aria-checked", "false");
  await expect(autoplay).toContainText("Off");
  await autoplay.click();
  await expect(autoplay).toHaveAttribute("aria-checked", "true");
  await expect(autoplay).toContainText("On");
  await expect(playlistActions.locator(".player-progress-menu-autoplay-indicator")).toBeVisible();
  await playlistActions.click();
  await expect(page.getByRole("button", { name: "Summary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show 1 more chapter" })).toBeHidden();
  expect(
    (await page.getByRole("list", { name: "Video chapters" }).boundingBox())?.width,
  ).toBeLessThanOrEqual(781);

  await page.setViewportSize({ width: 390, height: 844 });
  const actions = page.getByRole("button", { name: "Video actions" });
  const expand = page.getByRole("button", { name: "Show 1 more chapter" });

  await expect(actions).toBeVisible();
  await expect(expand).toBeVisible();
  await expect(page.getByRole("button", { name: "Summary" })).toBeHidden();
  await expect(playlistPanel).toBeVisible();
  await expect(playlistActions.locator(".player-progress-menu-autoplay-indicator")).toBeVisible();
  await playlistActions.click();
  await expect(autoplay).toBeVisible();
  await expect(autoplay).toHaveAttribute("aria-checked", "true");
  expect(await playlistVideos.evaluate((element) => getComputedStyle(element).overflowY)).toBe(
    "visible",
  );
  expect(await playlistPanel.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    "rgb(255, 255, 255)",
  );
  expect(
    await page
      .getByRole("button", { name: "Introduction" })
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe("rgb(255, 255, 255)");
  await expect(page.getByRole("button", { name: "Open playlist Saved Collection" })).toHaveCount(0);

  const titleBox = await title.boundingBox();
  const actionsBox = await actions.boundingBox();
  expect(actionsBox?.x).toBeGreaterThan(titleBox?.x ?? 0);

  const disclosureTextBox = await expand.locator("span").boundingBox();
  const disclosureIconBox = await expand.locator("svg").boundingBox();
  const disclosureTextCenter = (disclosureTextBox?.y ?? 0) + (disclosureTextBox?.height ?? 0) / 2;
  const disclosureIconCenter = (disclosureIconBox?.y ?? 0) + (disclosureIconBox?.height ?? 0) / 2;
  expect(Math.abs(disclosureTextCenter - disclosureIconCenter)).toBeLessThanOrEqual(1);

  await expand.click();
  await expect(page.getByRole("button", { name: "Summary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show fewer" })).toBeVisible();

  const detailsBox = await page.getByRole("region", { name: videoTitle }).boundingBox();
  const playlistBox = await playlistPanel.boundingBox();
  expect(playlistBox?.y).toBeGreaterThan((detailsBox?.y ?? 0) + (detailsBox?.height ?? 0));

  await page.route(`**/api/progress/videos/${videoId}/complete`, async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({}) });
  });
  await page.locator("video").dispatchEvent("ended");
  const completion = page.getByText("Video complete", { exact: true });
  await expect(completion).toBeVisible();
  await expect(page.getByRole("heading", { name: "Finished.", exact: true })).toBeVisible();
  await expect(completion).toHaveCSS("color", "rgb(51, 51, 51)");
  await expect(completion.locator("..")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("does not collapse a short wrapped video description", async ({ page }) => {
  await authenticate(page);

  const description =
    "Dr. Seth Capehart examines how modern routines can undermine energy, sleep, metabolic health, and recovery, and discusses practical ways to reduce stress and improve long-term health.";
  await page.route(`**/api/videos/${shortDescriptionVideoId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        video: {
          authors: ["Seth Capehart MD"],
          chapters: [],
          completed: false,
          coverUrl: null,
          description,
          durationSeconds: 120,
          id: shortDescriptionVideoId,
          playlistId: null,
          playlistSectionId: null,
          playlistSectionTitle: null,
          playlistTitle: null,
          positionSeconds: 0,
          progressPercent: 0,
          source: null,
          tags: [],
          title: "Modern Life Is A Disease",
        },
        playlist: null,
      }),
    });
  });
  await page.route(`**/api/playback/${shortDescriptionVideoId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ kind: "direct", url: "/media/short-description.mp4" }),
    });
  });
  await page.route(`**/api/progress/videos/${shortDescriptionVideoId}/open`, async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({}) });
  });
  await page.route("**/media/short-description.mp4", async (route) => {
    await route.fulfill({ contentType: "video/mp4", body: "" });
  });

  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto(`/videos/${shortDescriptionVideoId}`);

  await expect(page.getByText(description)).toBeVisible();
  await expect(page.locator("button[aria-controls^='video-details-']")).toHaveCount(0);
});

test("resumes and autoplays once a growing HLS playlist reaches the saved position", async ({
  page,
}) => {
  await authenticate(page);
  const nextId = "f".repeat(24);
  const first: PlaylistVideoDto = {
    id: videoId,
    playlistId,
    title: "First lesson",
    durationSeconds: 2,
    positionSeconds: 0,
    progressPercent: 0,
    completed: false,
    coverUrl: null,
  };
  const next: PlaylistVideoDto = {
    ...first,
    id: nextId,
    title: "Converted lesson",
    durationSeconds: 8,
    positionSeconds: 5,
    progressPercent: 63,
  };
  const playlist: PlaylistDetailDto = {
    id: playlistId,
    title: "Saved Collection",
    description: "",
    authors: [],
    tags: [],
    source: null,
    coverUrl: null,
    durationSeconds: 10,
    videoCount: 2,
    completedCount: 0,
    progressPercent: 0,
    nextVideoId: videoId,
    sections: [{ id: null, title: "Videos", videos: [first, next] }],
  };

  await page.route("**/api/videos/*", async (route) => {
    const video: VideoDetailDto = {
      ...(route.request().url().endsWith(nextId) ? next : first),
      playlistTitle: playlist.title,
      playlistSectionId: null,
      playlistSectionTitle: null,
      description: "",
      authors: [],
      tags: [],
      source: null,
      chapters: [],
    };
    await route.fulfill({ json: { video, playlist } });
  });
  await page.route("**/api/progress/**", (route) => route.fulfill({ json: {} }));
  let availableSegments = 1;
  let nextManifestRequests = 0;
  await page.route("**/api/playback/**", async (route) => {
    const firstVideo = route.request().url().endsWith(videoId);
    const result: PlaybackResult = firstVideo
      ? { kind: "hls", status: "ready", progress: 100, url: "/hls-fixture/first.m3u8" }
      : {
          kind: "hls",
          status: "converting",
          progress: 50,
          availableSeconds: availableSegments * 2,
          url: "/hls-fixture/next.m3u8",
        };
    await route.fulfill({ json: result });
  });
  await page.route("**/hls-fixture/*.m3u8", async (route) => {
    const firstVideo = route.request().url().endsWith("first.m3u8");
    if (!firstVideo) nextManifestRequests++;
    const count = firstVideo ? 1 : availableSegments;
    const segments = Array.from(
      { length: count },
      (_, index) => `#EXTINF:2.000000,\nsegment-${index}.bin`,
    );
    await route.fulfill({
      contentType: "application/vnd.apple.mpegurl",
      body: [
        "#EXTM3U",
        "#EXT-X-VERSION:6",
        "#EXT-X-TARGETDURATION:2",
        "#EXT-X-MEDIA-SEQUENCE:0",
        "#EXT-X-PLAYLIST-TYPE:EVENT",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        ...segments,
        ...(firstVideo ? ["#EXT-X-ENDLIST"] : []),
        "",
      ].join("\n"),
    });
  });
  await page.route("**/hls-fixture/*.bin", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    await route.fulfill({
      contentType: "video/mp2t",
      body: await readFile(new URL(`./fixtures/hls/${name}`, import.meta.url)),
    });
  });

  await page.goto(`/videos/${videoId}?list=${playlistId}`);
  const media = page.locator("video");
  await expect
    .poll(() =>
      media.evaluate((video) => video instanceof HTMLVideoElement && video.readyState >= 2),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Playlist actions" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Autoplay next video/ }).click();
  const poll = page.waitForResponse(`**/api/playback/${nextId}/conversion`);
  await media.evaluate((video) => {
    if (!(video instanceof HTMLVideoElement)) throw new Error("Missing player video");
    video.muted = true;
    video.dispatchEvent(new Event("ended"));
  });
  await expect(page).toHaveURL(`/videos/${nextId}?list=${playlistId}`);
  await expect(page.getByRole("heading", { name: "Preparing this video" })).toBeVisible();
  const response = await poll;
  expect(await response.json()).toMatchObject({ availableSeconds: 2 });
  expect(nextManifestRequests).toBe(0);

  availableSegments = 3;
  await expect
    .poll(() =>
      media.evaluate((element) => {
        if (!(element instanceof HTMLVideoElement)) throw new Error("Missing player video");
        return { played: element.played.length, paused: element.paused };
      }),
    )
    .toMatchObject({ played: 1, paused: false });
  const start = await media.evaluate((video) =>
    video instanceof HTMLVideoElement && video.played.length ? video.played.start(0) : -1,
  );
  expect(start).toBeCloseTo(5, 1);
  expect(nextManifestRequests).toBeGreaterThan(0);
});

test("waits for a native HLS source after the HLS.js chunk fails to load", async ({ page }) => {
  await authenticate(page);
  await page.addInitScript(() => {
    const canPlayType = HTMLVideoElement.prototype.canPlayType;
    HTMLVideoElement.prototype.canPlayType = function (type) {
      return type === "application/vnd.apple.mpegurl" ? "maybe" : canPlayType.call(this, type);
    };
  });
  await page.route("**/assets/hls.light-*.js", (route) => route.abort());
  const video: VideoDetailDto = {
    id: videoId,
    title: "Converted lesson",
    durationSeconds: 8,
    positionSeconds: 5,
    progressPercent: 63,
    completed: false,
    coverUrl: null,
    playlistId: null,
    playlistTitle: null,
    playlistSectionId: null,
    playlistSectionTitle: null,
    description: "",
    authors: [],
    tags: [],
    source: null,
    chapters: [],
  };
  await page.route(`**/api/videos/${videoId}`, (route) =>
    route.fulfill({ json: { video, playlist: null } }),
  );
  await page.route(`**/api/progress/videos/${videoId}/open`, (route) =>
    route.fulfill({ json: {} }),
  );
  const url = "/hls-fixture/converted.m3u8";
  let ready = false;
  await page.route("**/api/playback/**", (route) => {
    if (!route.request().url().endsWith("/conversion")) {
      return route.fulfill({ json: { kind: "converting", status: "converting", progress: 0 } });
    }
    const result: PlaybackResult = ready
      ? { kind: "hls", status: "ready", progress: 100, url }
      : { kind: "hls", status: "converting", progress: 50, availableSeconds: 6, url };
    return route.fulfill({ json: result });
  });
  await page.route(`**${url}`, (route) => route.fulfill({ status: 204 }));

  const chunkFailed = page.waitForEvent("requestfailed", (request) =>
    request.url().includes("/assets/hls.light-"),
  );
  await page.goto(`/videos/${videoId}`);
  await chunkFailed;
  ready = true;

  await expect(page.locator("video")).toHaveAttribute("src", url);
  await expect(page.getByRole("heading", { name: "Video unavailable" })).toHaveCount(0);
});
