import { selectBrowserAdmin, setupBrowserAdmin } from "./profiles.helpers.js";
import { expect, test, type Page } from "@playwright/test";

const videoId = "a".repeat(24);
const playlistId = "b".repeat(24);

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

test("uses responsive library filters and a mobile drawer", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/library**", async (route) => {
    const playlistView = new URL(route.request().url()).searchParams.get("view") === "playlists";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authors: [{ count: playlistView ? 2 : 32, name: "Example Author" }],
        continueWatching: [],
        pagination: { page: 1, pageSize: 24, totalPages: 1, totalVideos: 1 },
        playlists: [
          {
            authors: ["Example Author"],
            completedCount: 0,
            coverUrl: null,
            description: "",
            durationSeconds: 120,
            id: playlistId,
            nextVideoId: videoId,
            progressPercent: 0,
            source: null,
            tags: ["Example Tag"],
            title: "Saved Collection",
            videoCount: 1,
          },
        ],
        tags: [{ count: playlistView ? 3 : 100, name: "Example Tag" }],
        videos: [
          {
            authors: ["Example Author"],
            completed: false,
            coverUrl: null,
            description: "",
            durationSeconds: 120,
            id: videoId,
            playlistId,
            playlistSectionId: null,
            playlistSectionTitle: null,
            playlistTitle: "Saved Collection",
            positionSeconds: 0,
            progressPercent: 0,
            source: null,
            tags: ["Example Tag"],
            title: "Example video",
          },
        ],
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/videos");

  const search = page.getByTestId("mobile-library-search");
  const actions = page.getByTestId("mobile-filter-actions");
  const viewButton = page.locator('[data-mobile-filter="view"]');
  const authorButton = page.locator('[data-mobile-filter="author"]');
  const filterColumn = page.getByTestId("library-filter-column");
  await expect(search).toBeVisible();
  await expect(actions).toBeVisible();
  await expect(authorButton).toBeVisible();
  await expect(viewButton).toHaveCSS("background-color", "rgb(65, 65, 65)");
  await expect(viewButton).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(filterColumn).toHaveCSS("position", "sticky");
  await expect(filterColumn).toHaveCSS("top", "66px");
  await expect(filterColumn).toHaveCSS("background-color", "rgb(24, 24, 24)");
  await expect(filterColumn).toHaveCSS("box-shadow", "none");
  await expect(filterColumn).toHaveCSS("padding-top", "20px");
  await expect(filterColumn).toHaveCSS("padding-bottom", "20px");

  const headingBox = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  const searchBox = (await search.boundingBox())!;
  expect(Math.round(searchBox.x)).toBe(Math.round(headingBox.x));
  expect(Math.round(searchBox.y - (headingBox.y + headingBox.height))).toBe(24);
  const mobileFilterBox = (await filterColumn.boundingBox())!;
  const mobileClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(mobileFilterBox.x).toBe(0);
  expect(mobileFilterBox.width).toBe(mobileClientWidth);
  const actionsBox = (await actions.boundingBox())!;
  const firstVideoBox = (await page.locator("article").first().boundingBox())!;
  expect(Math.round(firstVideoBox.y - (actionsBox.y + actionsBox.height))).toBe(24);

  await page.getByTestId("library-layout").evaluate((element) => {
    element.style.minHeight = "1800px";
  });
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(async () => Math.round((await filterColumn.boundingBox())!.y)).toBe(66);
  await page.evaluate(() => window.scrollTo(0, 0));

  await authorButton.click();
  const drawer = page.getByRole("dialog", { name: "Authors" });
  const closeButton = drawer.getByRole("button", { name: "Close authors filters" });
  await expect(drawer).toBeVisible();
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(authorButton).toBeFocused();

  await authorButton.click();
  await drawer.getByRole("checkbox", { name: "Example Author (32)" }).check();
  await expect(page).toHaveURL(/author=Example(?:\+|%20)Author/);
  await expect(authorButton).toHaveCSS("background-color", "rgb(65, 65, 65)");
  await expect(authorButton).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);

  const pageSizeButton = page.locator('[data-mobile-filter="pageSize"]');
  await expect(pageSizeButton).toHaveText("24 per page");
  await pageSizeButton.click();
  const pageSizeDrawer = page.getByRole("dialog", { name: "Videos per page" });
  await expect(pageSizeDrawer).toBeVisible();
  await expect(pageSizeDrawer.getByRole("radio", { name: "24" })).toBeChecked();
  await expect(pageSizeDrawer.getByRole("radio", { name: "12" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pageSizeDrawer).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(search).toBeHidden();
  await expect(actions).toBeHidden();
  const desktopAuthors = page.getByRole("group", { name: "Authors" });
  const desktopTags = page.getByRole("group", { name: "Tags" });
  await expect(desktopAuthors).toBeVisible();
  await expect(page.getByRole("group", { name: "Videos per page" })).toBeVisible();
  await expect(page.locator('input[name="library-desktop-page-size"][value="24"]')).toBeChecked();

  await page.locator('input[name="library-desktop-view"][value="playlists"]').check();
  await expect(page).toHaveURL(/view=playlists/);
  await expect(desktopAuthors.getByRole("checkbox", { name: "Example Author (2)" })).toBeVisible();
  await expect(desktopTags.getByRole("checkbox", { name: "Example Tag (3)" })).toBeVisible();
});

test("loads more videos on mobile and keeps the page in the URL", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/library**", async (route) => {
    const requestedPage = Number(new URL(route.request().url()).searchParams.get("page") ?? "1");
    const id = String(requestedPage).repeat(24);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authors: [],
        continueWatching: [],
        pagination: { page: requestedPage, pageSize: 1, totalPages: 2, totalVideos: 2 },
        playlists: [],
        tags: [],
        videos: [
          {
            authors: [],
            completed: false,
            coverUrl: null,
            description: "",
            durationSeconds: 60,
            id,
            playlistId: null,
            playlistSectionId: null,
            playlistSectionTitle: null,
            playlistTitle: null,
            positionSeconds: 0,
            progressPercent: 0,
            source: null,
            tags: [],
            title: requestedPage === 2 ? "Second video" : "First video",
          },
        ],
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/videos");
  await expect(page.getByText("First video", { exact: true })).toBeVisible();

  const loadMore = page.getByTestId("load-more-videos");
  await expect(loadMore).toHaveText("Load more");
  await loadMore.click();

  await expect(page.getByText("Second video", { exact: true })).toBeVisible();
  await expect(page.getByText("First video", { exact: true })).toBeVisible();
  await expect(loadMore).toHaveCount(0);
  await expect(page).toHaveURL(/page=2/);

  await page.reload();
  await expect(page.getByText("First video", { exact: true })).toBeVisible();
  await expect(page.getByText("Second video", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("First video", { exact: true })).toBeHidden();
  await expect(page.getByText("Second video", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
});

test("loads more author videos on mobile and restores them from the URL", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/library**", async (route) => {
    const requestedPage = Number(new URL(route.request().url()).searchParams.get("page") ?? "1");
    const id = String(requestedPage + 2).repeat(24);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authors: [{ count: 2, name: "Gordon Ryan" }],
        continueWatching: [],
        pagination: { page: requestedPage, pageSize: 1, totalPages: 2, totalVideos: 2 },
        playlists: [
          {
            authors: ["Gordon Ryan"],
            completedCount: 0,
            coverUrl: null,
            description: "",
            durationSeconds: 120,
            id: playlistId,
            nextVideoId: id,
            progressPercent: 0,
            source: null,
            tags: [],
            title: "Gordon Collection",
            videoCount: 2,
          },
        ],
        tags: [],
        videos: [
          {
            authors: ["Gordon Ryan"],
            completed: false,
            coverUrl: null,
            description: "",
            durationSeconds: 60,
            id,
            playlistId,
            playlistSectionId: null,
            playlistSectionTitle: null,
            playlistTitle: "Gordon Collection",
            positionSeconds: 0,
            progressPercent: 0,
            source: null,
            tags: [],
            title: requestedPage === 2 ? "Second author video" : "First author video",
          },
        ],
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/authors/Gordon%20Ryan");
  await expect(page.getByText("First author video", { exact: true })).toBeVisible();
  const playlistLink = page.getByRole("link", { name: "Gordon Collection", exact: true });
  await expect(playlistLink).toBeVisible();

  const loadMore = page.getByTestId("load-more-author-videos");
  await expect(loadMore).toHaveText("Load more");
  await loadMore.click();

  await expect(page.getByText("First author video", { exact: true })).toBeVisible();
  await expect(page.getByText("Second author video", { exact: true })).toBeVisible();
  await expect(playlistLink).toBeVisible();
  await expect(loadMore).toHaveCount(0);
  await expect(page).toHaveURL(/page=2/);

  await page.reload();
  await expect(page.getByText("First author video", { exact: true })).toBeVisible();
  await expect(page.getByText("Second author video", { exact: true })).toBeVisible();
  await expect(playlistLink).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByText("First author video", { exact: true })).toBeHidden();
  await expect(page.getByText("Second author video", { exact: true })).toBeVisible();
  await expect(playlistLink).toBeVisible();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
});
