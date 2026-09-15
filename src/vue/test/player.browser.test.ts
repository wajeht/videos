import { selectBrowserAdmin } from "./profiles.helpers.js";
import { expect, test, type Page } from "@playwright/test";

const videoId = "c".repeat(24);
const playlistId = "d".repeat(24);
const shortDescriptionVideoId = "e".repeat(24);

async function authenticate(page: Page): Promise<void> {
  const password = "playwright-password";
  const setup = await page.request.post("/api/auth/password", {
    data: {
      password,
      confirmPassword: password,
      adminName: "Admin",
      adminPassword: "test-admin-password",
      setupToken: "videos-playwright-setup-token",
    },
  });
  expect([201, 409]).toContain(setup.status());
  expect((await page.request.post("/api/auth", { data: { password } })).status()).toBe(200);
  await selectBrowserAdmin(page);
}

test("uses responsive video details and places the playlist below them on mobile", async ({
  page,
}) => {
  await authenticate(page);

  const videoTitle = "Basics of computer's memory and Getting started - C Programming Tutorial 02";
  const video = {
    authors: ["Example Author"],
    chapters: [
      { startSeconds: 0, title: "Introduction", thumbnailUrl: null },
      { startSeconds: 90, title: "Computer memory", thumbnailUrl: null },
      { startSeconds: 180, title: "Pointers", thumbnailUrl: null },
      { startSeconds: 270, title: "Summary", thumbnailUrl: null },
    ],
    completed: false,
    coverUrl: null,
    description:
      "A complete introduction to programming, computer memory, and the ideas used throughout this playlist.",
    durationSeconds: 120,
    id: videoId,
    playlistId,
    playlistSectionId: null,
    playlistSectionTitle: null,
    playlistTitle: "Saved Collection",
    positionSeconds: 0,
    progressPercent: 0,
    source: null,
    tags: [],
    title: videoTitle,
  };

  await page.route(`**/api/videos/${videoId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        video,
        playlist: {
          authors: ["Example Author"],
          completedCount: 0,
          coverUrl: null,
          description: "",
          durationSeconds: 120,
          id: playlistId,
          nextVideoId: videoId,
          progressPercent: 0,
          sections: [{ id: null, title: "Videos", videos: [video] }],
          source: null,
          tags: [],
          title: "Saved Collection",
          videoCount: 1,
        },
      }),
    });
  });
  await page.route(`**/api/playback/${videoId}`, async (route) => {
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
  await expect(title).toBeVisible();
  await expect(playlistPanel).toHaveCount(0);

  await page.goto(`/videos/${videoId}?list=${playlistId}`);
  await expect(title).toBeVisible();
  const clippedVideoPixels = await page.locator("video").evaluate((element) => {
    const videoBounds = element.getBoundingClientRect();
    const frameBounds = element.parentElement?.getBoundingClientRect();

    return frameBounds ? Math.max(0, Math.ceil(videoBounds.bottom - frameBounds.bottom)) : 0;
  });
  expect(clippedVideoPixels).toBe(0);
  expect((await title.boundingBox())?.width).toBeGreaterThan(1000);
  const playlistVideos = playlistPanel.locator(":scope > div");
  await expect(playlistPanel).toBeVisible();
  await expect(playlistPanel.getByText("2m", { exact: true })).toBeVisible();
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
    "rgb(242, 243, 241)",
  );
  expect(
    await page
      .getByRole("button", { name: "Introduction" })
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe("rgb(242, 243, 241)");
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
