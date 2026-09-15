import { selectBrowserAdmin, setupBrowserAdmin } from "./profiles.helpers.js";
import { expect, test, type Locator, type Page } from "@playwright/test";

interface ElementBox {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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

async function elementBox(locator: Locator): Promise<ElementBox> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

function expectBoxToStayFixed(before: ElementBox, after: ElementBox): void {
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y).toBeCloseTo(before.y, 1);
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(after.height).toBeCloseTo(before.height, 1);
}

function expectRowToStayFixed(before: ElementBox, after: ElementBox): void {
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y).toBeCloseTo(before.y, 1);
  expect(after.height).toBeCloseTo(before.height, 1);
}

async function expectStableLibraryStatusLayout(
  page: Page,
  viewport: { height: number; width: number },
): Promise<void> {
  await page.setViewportSize(viewport);
  const scanStarted = deferred();
  const releaseScan = deferred();
  await page.route(
    "**/api/scan",
    async (route) => {
      scanStarted.resolve();
      await releaseScan.promise;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          completedAt: "2026-09-03T17:02:00.000Z",
          playlistCount: 37,
          error: null,
          videoCount: 415,
          startedAt: "2026-09-03T17:01:00.000Z",
          status: "complete",
          warnings: [],
        }),
      });
    },
    { times: 1 },
  );

  const navigation = page.goto("/settings/library");
  await scanStarted.promise;

  try {
    await page.waitForLoadState("load");
    await page.evaluate(() => document.fonts.ready);

    const panel = page.locator("#settings-library-panel > section");
    const statusRow = page.locator("[data-library-status]");
    const refreshRow = page.locator("[data-last-refresh]");
    const statusSkeleton = page.locator("[data-library-status-skeleton]");
    const refreshSkeleton = page.locator("[data-last-refresh-skeleton]");
    const refreshButton = page.getByRole("button", { name: "Refresh library" });

    await expect(statusSkeleton).toBeVisible();
    await expect(refreshSkeleton).toBeVisible();

    const before = {
      panel: await elementBox(panel),
      refreshButton: await elementBox(refreshButton),
      refreshRow: await elementBox(refreshRow),
      refreshValue: await elementBox(refreshSkeleton),
      statusRow: await elementBox(statusRow),
      statusValue: await elementBox(statusSkeleton),
    };

    releaseScan.resolve();
    await navigation;
    await expect(page.getByText("37 playlists · 415 videos", { exact: true })).toBeVisible();
    await expect(statusSkeleton).toHaveCount(0);
    await expect(refreshSkeleton).toHaveCount(0);

    const after = {
      panel: await elementBox(panel),
      refreshButton: await elementBox(refreshButton),
      refreshRow: await elementBox(refreshRow),
      refreshValue: await elementBox(refreshRow.locator("time")),
      statusRow: await elementBox(statusRow),
      statusValue: await elementBox(page.getByText("37 playlists · 415 videos", { exact: true })),
    };

    expectBoxToStayFixed(before.panel, after.panel);
    expectBoxToStayFixed(before.refreshButton, after.refreshButton);
    expectRowToStayFixed(before.statusRow, after.statusRow);
    expectRowToStayFixed(before.refreshRow, after.refreshRow);
    expectRowToStayFixed(before.statusValue, after.statusValue);
    expectRowToStayFixed(before.refreshValue, after.refreshValue);
  } finally {
    releaseScan.resolve();
    await navigation;
  }
}

test("keeps library status controls fixed while counts and date load", async ({ page }) => {
  await authenticate(page);

  await expectStableLibraryStatusLayout(page, { width: 1280, height: 900 });
  await expectStableLibraryStatusLayout(page, { width: 390, height: 844 });
});
