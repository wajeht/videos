import { expect, test } from "@playwright/test";

// Exercise the real session cookies, profile permissions, and cross-tab switch behavior.
test("selects locked profiles and limits profile management to admins", async ({
  page,
  context,
}, testInfo) => {
  const setup = await page.request.post("/api/auth/password", {
    data: {
      password: "playwright-password",
      confirmPassword: "playwright-password",
      adminName: "Admin",
      adminPassword: "test-admin-password",
      setupToken: "videos-playwright-setup-token",
    },
  });
  expect([201, 409]).toContain(setup.status());
  await page.goto("/");
  await page.getByLabel(/^Password/).fill("playwright-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("profile-picker.png"), fullPage: true });
  await page.getByRole("button", { name: "Admin Admin · Locked", exact: true }).click();
  await page.getByLabel(/^Profile password/).fill("wrong-password");
  await page.getByRole("button", { name: "Unlock profile" }).click();
  await expect(page.getByLabel(/^Profile password/)).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel(/^Profile password/).fill("test-admin-password");
  await page.getByRole("button", { name: "Unlock profile" }).click();
  await expect(page.getByRole("button", { name: "Switch profile" })).toHaveText(/Admin/);
  await page.goto("/settings/profiles");
  await page.getByRole("button", { name: "Add profile" }).click();
  await page.getByLabel(/^Profile name/).fill("Browser Member");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "Browser Member", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("manage-profiles.png"), fullPage: true });
  const secondTab = await context.newPage();
  await secondTab.goto("/settings/profiles");
  await expect(secondTab.getByRole("button", { name: "Add profile" })).toBeVisible();
  await page.getByRole("button", { name: "Switch profile" }).click();
  await expect(secondTab.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await page.getByRole("button", { name: "Browser Member Open", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add profile" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await expect(secondTab.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel(/^New profile password/).fill("member-password");
  await page.getByLabel(/^Confirm profile password/).fill("member-password");
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Browser Member Locked", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browser Member Locked", exact: true }).click();
  await page.getByLabel(/^Profile password/).fill("member-password");
  await page.getByRole("button", { name: "Unlock profile" }).click();
  await page.goto("/settings/access");
  await expect(
    page.getByText("Only an admin profile can change the shared app password."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Change password", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch profile" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("member-mobile.png"), fullPage: true });
  await secondTab.close();
});
