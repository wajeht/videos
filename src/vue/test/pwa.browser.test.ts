import { selectBrowserAdmin, setupBrowserAdmin } from "./profiles.helpers.js";
import { expect, test } from "@playwright/test";
import { z } from "zod";

const manifestSchema = z.object({
  screenshots: z.array(z.object({ form_factor: z.string(), src: z.string() })),
  shortcuts: z.array(z.object({ url: z.string() })),
});

test("keeps the install experience online-only", async ({ context, page }) => {
  const password = "playwright-password";
  const setup = await page.request.post("/api/auth/password", {
    data: {
      password,
      confirmPassword: password,
      setupToken: "videos-playwright-setup-token",
    },
  });
  expect([201, 409]).toContain(setup.status());
  const login = await page.request.post("/api/auth", { data: { password } });
  expect(login.status()).toBe(200);
  await setupBrowserAdmin(page);
  await selectBrowserAdmin(page);

  let releaseAuthCheck: () => void = () => undefined;
  let markAuthCheckStarted: () => void = () => undefined;
  const authCheckReleased = new Promise<void>((resolve) => {
    releaseAuthCheck = resolve;
  });
  const authCheckStarted = new Promise<void>((resolve) => {
    markAuthCheckStarted = resolve;
  });
  await page.route(
    "**/api/auth/me",
    async (route) => {
      markAuthCheckStarted();
      await authCheckReleased;
      await route.continue();
    },
    { times: 1 },
  );
  const navigation = page.goto("/");
  await authCheckStarted;
  try {
    await expect(page.getByText("Checking your session…")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Opening Videos…" })).toBeVisible();
  } finally {
    releaseAuthCheck();
    await navigation;
  }

  await expect(page.getByRole("heading", { level: 1, name: "Continue watching" })).toBeVisible();
  await expect(page).toHaveTitle("Videos");
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  const manifest = manifestSchema.parse(await manifestResponse.json());
  expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual([
    "/videos",
    "/settings/library",
  ]);
  expect(manifest.screenshots.map((screenshot) => screenshot.form_factor)).toEqual([
    "narrow",
    "wide",
  ]);

  await page.goto("/videos");
  await expect(page.getByRole("heading", { level: 1, name: "All videos" })).toBeVisible();
  await expect(page).toHaveTitle("All videos · Videos");

  await page.reload();
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    )
    .toBe(0);

  await context.setOffline(true);
  try {
    await expect(page.getByText("You’re offline. Reconnect to keep using Videos.")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }

  await page.setViewportSize({ width: 590, height: 844 });
  await page.goto("/settings/library");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page).toHaveTitle("Library settings · Videos");

  const settingsNavigation = page.getByRole("navigation", { name: "Settings sections" });
  await settingsNavigation.getByRole("link", { name: "Access", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/access$/);
  await expect(page.getByRole("heading", { level: 2, name: "Access" })).toBeVisible();
  await expect(page).toHaveTitle("Access settings · Videos");
  await settingsNavigation.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/library$/);
  await expect(page).toHaveTitle("Library settings · Videos");

  await page.getByRole("button", { name: "Refresh library" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Library refreshed" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  const signOutDialog = page.getByRole("dialog", { name: "Sign out?" });
  await expect(signOutDialog).toBeVisible();
  await expect(signOutDialog).toHaveCSS("width", "550px");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page
    .getByRole("dialog", { name: "Sign out?" })
    .getByRole("button", { name: "Sign out" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await page.locator('input[autocomplete="current-password"]').fill("wrong-playwright-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid password" })).toBeVisible();
  await expect(page.getByText("Your session expired. Sign in again.")).toHaveCount(0);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await page.getByRole("button", { name: "Admin Admin · Locked", exact: true }).click();
  await page.getByLabel(/^Profile password/).fill("test-admin-password");
  await page.getByRole("button", { name: "Unlock profile" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
});
