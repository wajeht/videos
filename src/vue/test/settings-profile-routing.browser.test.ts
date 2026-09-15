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

for (const scenario of ["create", "update", "return"] as const) {
  test(`finishing ${scenario} preserves later navigation`, async ({ page }) => {
    await authenticate(page);
    await page.goto("/settings/profiles/new");
    if (scenario === "update") {
      await page.getByLabel(/^Profile name/).fill("Routing Member");
      await page.getByRole("button", { name: "Create profile", exact: true }).click();
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("heading", { name: "Routing Member", exact: true }) });
      await row.getByRole("link", { name: "Edit", exact: true }).click();
    }
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    await page.route(
      scenario === "update" ? "**/api/profiles/*" : "**/api/profiles",
      async (route) => {
        if (route.request().method() === (scenario === "update" ? "PUT" : "POST")) {
          started();
          await paused;
        }
        await route.continue();
      },
    );
    await page.getByLabel(/^Profile name/).fill(`Slow ${scenario}`);
    await page
      .getByRole("button", {
        name: scenario === "update" ? "Save profile" : "Create profile",
        exact: true,
      })
      .click();
    await requested;
    await page.getByRole("link", { name: "Library", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/library$/);
    if (scenario === "return") {
      await page.getByRole("link", { name: "Profiles", exact: true }).click();
      await page.getByRole("link", { name: "Add profile", exact: true }).click();
      await page.getByLabel(/^Profile name/).fill("New draft");
    }
    release();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: scenario === "update" ? "Profile updated" : "Profile created" }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      scenario === "return" ? /\/settings\/profiles\/new$/ : /\/settings\/library$/,
    );
    if (scenario === "return")
      await expect(page.getByLabel(/^Profile name/)).toHaveValue("New draft");
  });
}
