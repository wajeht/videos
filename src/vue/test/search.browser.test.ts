import { selectBrowserAdmin } from "./profiles.helpers.js";
import { expect, test, type Page } from "@playwright/test";

const videoId = "c".repeat(24);

async function authenticate(page: Page): Promise<void> {
  const password = "playwright-password";
  const setup = await page.request.post("/api/auth/password", {
    data: {
      password,
      confirmPassword: password,
      adminName: "Admin",
      adminPin: "0123",
      setupToken: "videos-playwright-setup-token",
    },
  });
  expect([201, 409]).toContain(setup.status());
  expect((await page.request.post("/api/auth", { data: { password } })).status()).toBe(200);
  await selectBrowserAdmin(page);
}

test("searches videos globally with Command K", async ({ page }) => {
  await authenticate(page);
  let searchRequest: URL | undefined;
  await page.route("**/covers/search.jpg", async (route) => {
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#29313c"/><circle cx="80" cy="45" r="24" fill="#d58b3b"/></svg>',
    });
  });
  await page.route("**/api/library**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.has("query")) searchRequest = requestUrl;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authors: [],
        continueWatching: [],
        pagination: { page: 1, pageSize: 20, totalPages: 1, totalVideos: 1 },
        playlists: [],
        tags: [],
        videos: [
          {
            authors: ["Example Author"],
            completed: false,
            coverUrl: "/covers/search.jpg",
            description: "",
            durationSeconds: 120,
            id: videoId,
            playlistId: null,
            playlistSectionId: null,
            playlistSectionTitle: null,
            playlistTitle: null,
            positionSeconds: 30,
            progressPercent: 25,
            source: null,
            tags: [],
            title: "Memory optimization",
          },
        ],
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const palette = page.locator('dialog[aria-label="Search videos"]');
  await expect(palette).toHaveCount(0);
  await page.keyboard.press("Meta+k");
  await expect(palette).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(palette).toHaveCount(1);
  await page.keyboard.press("Meta+k");
  const input = palette.getByRole("combobox", {
    name: "Search videos, authors, playlists, and tags",
  });
  await expect(palette).toBeVisible();
  await expect(palette).toHaveCSS("width", "720px");
  await expect(input).toBeFocused();
  await expect(palette.getByText("Find videos by title, author, playlist, or tag.")).toBeVisible();
  await input.fill("memory");
  const result = palette.getByRole("option", { name: /Memory optimization/ });
  await expect(result).toBeVisible();
  await expect(result.locator("mark")).toHaveText("Memory");
  const thumbnail = result.locator('img[src="/covers/search.jpg"]');
  await expect(thumbnail).toBeVisible();
  await expect(thumbnail).toHaveCSS("width", "96px");
  await expect(result.getByText("2m", { exact: true })).toBeVisible();
  await expect(result.getByText("Video progress: 25%", { exact: true })).toHaveText(
    "Video progress: 25%",
  );
  const thumbnailBox = await thumbnail.boundingBox();
  const titleBox = await result.getByText("Memory optimization", { exact: true }).boundingBox();
  expect(thumbnailBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(thumbnailBox!.x + thumbnailBox!.width).toBeLessThan(titleBox!.x);
  expect(searchRequest?.searchParams.get("query")).toBe("memory");
  expect(searchRequest?.searchParams.get("page")).toBe("1");
  expect(searchRequest?.searchParams.get("pageSize")).toBe("20");

  await expect(result).toHaveAttribute("aria-selected", "false");
  await expect(result).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await input.press("ArrowDown");
  await expect(result).toHaveAttribute("aria-selected", "true");
  await expect(result).toHaveCSS("background-color", "rgb(41, 49, 60)");
  await expect(result).toHaveCSS("border-left-color", "rgb(213, 139, 59)");

  await page.keyboard.press("Meta+k");
  await page.keyboard.press("Meta+k");
  await palette
    .getByRole("combobox", { name: "Search videos, authors, playlists, and tags" })
    .fill("memory");
  await expect(result).toBeVisible();
  await palette
    .getByRole("combobox", { name: "Search videos, authors, playlists, and tags" })
    .press("ArrowDown");

  await palette
    .getByRole("combobox", { name: "Search videos, authors, playlists, and tags" })
    .press("Enter");
  await expect(page).toHaveURL(new RegExp(`/videos/${videoId}$`));
  await expect(palette).not.toBeVisible();
});
