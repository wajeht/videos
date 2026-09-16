import { expect, test, type Page } from "@playwright/test";
import { selectBrowserAdmin, setupBrowserAdmin } from "./profiles.helpers.js";

async function authenticate(page: Page) {
  const password = "playwright-password";
  const setup = await page.request.post("/api/auth/password", {
    data: { password, confirmPassword: password, setupToken: "videos-playwright-setup-token" },
  });
  expect([201, 409]).toContain(setup.status());
  expect((await page.request.post("/api/auth", { data: { password } })).status()).toBe(200);
  await setupBrowserAdmin(page);
  await selectBrowserAdmin(page);
}

test("switching from Access to a member should land on an accessible page", async ({ page }) => {
  await authenticate(page);
  await page.goto("/settings/profiles/new");
  await page.getByLabel(/^Profile name/).fill("Review Member");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review Member", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Access", exact: true }).click();
  await page.getByRole("button", { name: "Switch profile", exact: true }).click();
  await page.getByRole("button", { name: "Review Member Open", exact: true }).click();
  await expect(page.getByRole("link", { name: "Videos home" })).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/profiles$/);
  await expect(page.getByRole("heading", { name: "Profile details", exact: true })).toBeVisible();
});

for (const scenario of [
  "create",
  "update",
  "return",
  "update-return",
  "lock-return",
  "delete-return",
] as const) {
  test(`finishing ${scenario} preserves later navigation`, async ({ page }) => {
    await authenticate(page);
    const updating = scenario === "update" || scenario === "update-return";
    const locking = scenario === "lock-return";
    const deleting = scenario === "delete-return";
    const returning = scenario === "return" || scenario === "update-return" || locking || deleting;
    await page.goto("/settings/profiles/new");
    if (updating || locking || deleting) {
      await page.getByLabel(/^Profile name/).fill(`Routing ${scenario}`);
      await page.getByRole("button", { name: "Create profile", exact: true }).click();
      await page.getByRole("link", { name: `Edit Routing ${scenario}`, exact: true }).click();
    }
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    let operation: "create" | "update" | "lock" | "delete" = "create";
    if (updating) operation = "update";
    if (locking) operation = "lock";
    if (deleting) operation = "delete";
    const action = {
      create: {
        method: "POST",
        path: "**/api/profiles",
        button: "Create profile",
        message: "Profile created",
      },
      update: {
        method: "PUT",
        path: "**/api/profiles/*",
        button: "Save profile",
        message: "Profile updated",
      },
      delete: {
        method: "DELETE",
        path: "**/api/profiles/*",
        button: "Delete profile",
        message: "Profile deleted",
      },
      lock: {
        method: "PUT",
        path: "**/api/profiles/*/password",
        button: "Set password",
        message: "Profile password updated",
      },
    }[operation];
    await page.route(action.path, async (route) => {
      if (route.request().method() === action.method) {
        started();
        await paused;
      }
      await route.continue();
    });
    if (locking) {
      await page.getByLabel(/^New profile password/).fill("member-password");
      await page.getByLabel(/^Confirm profile password/).fill("member-password");
    } else if (!deleting) await page.getByLabel(/^Profile name/).fill(`Slow ${scenario}`);
    await page
      .getByRole("button", {
        name: action.button,
        exact: true,
      })
      .click();
    if (deleting) {
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete profile", exact: true })
        .click();
    }
    await requested;
    await page.getByRole("link", { name: "Library", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/library$/);
    if (returning) {
      await page.getByRole("link", { name: "Profiles", exact: true }).click();
      await page.getByRole("link", { name: "Add profile", exact: true }).click();
      await page.getByLabel(/^Profile name/).fill("New draft");
    }
    release();
    await expect(
      page.getByRole("status").filter({
        hasText: action.message,
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(returning ? /\/settings\/profiles\/new$/ : /\/settings\/library$/);
    if (returning) await expect(page.getByLabel(/^Profile name/)).toHaveValue("New draft");
  });
}
