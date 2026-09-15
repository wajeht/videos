import { expect, test } from "@playwright/test";
import { fillProfilePin } from "./profiles.helpers.js";

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
      adminPin: "0123",
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
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Unlock Admin" })).toBeVisible();
  const pinBoxes = page.getByRole("group", { name: "Profile PIN", exact: true }).locator("input");
  await expect(pinBoxes).toHaveCount(4);
  await expect(pinBoxes.first()).toHaveAttribute("inputmode", "numeric");
  await fillProfilePin(page, "Profile PIN", "123");
  expect(await pinBoxes.last().evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(
    false,
  );
  await fillProfilePin(page, "Profile PIN", "9999");
  await page.getByRole("button", { name: "Unlock profile" }).click();
  await expect(
    page.getByRole("group", { name: "Profile PIN", exact: true }).locator("input").first(),
  ).toHaveAttribute("aria-invalid", "true");
  await fillProfilePin(page, "Profile PIN", "0123");
  await page.getByRole("button", { name: "Unlock profile" }).click();
  await expect(page.getByRole("button", { name: "Switch profile" })).toHaveText(/Admin/);
  const navigation = await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .boundingBox();
  const profileButton = await page.getByRole("button", { name: "Switch profile" }).boundingBox();
  expect(navigation).not.toBeNull();
  expect(profileButton).not.toBeNull();
  expect(profileButton!.x - (navigation!.x + navigation!.width)).toBeCloseTo(24, 0);
  const styles = await page.getByRole("button", { name: "Switch profile" }).evaluate((button) => {
    const buttonStyle = getComputedStyle(button);
    const linkStyle = getComputedStyle(
      document.querySelector('nav[aria-label="Main navigation"] a')!,
    );
    return {
      font: buttonStyle.font,
      linkFont: linkStyle.font,
      borderTopWidth: buttonStyle.borderTopWidth,
      borderRadius: buttonStyle.borderRadius,
    };
  });
  expect(styles.font).toBe(styles.linkFont);
  expect(styles.borderTopWidth).toBe("0px");
  expect(styles.borderRadius).toBe("0px");
  await page.goto("/settings/profiles");
  await expect(page.getByRole("link", { name: "Access", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add profile" }).click();
  await page.getByLabel(/^Profile name/).fill("Browser Member");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "Browser Member", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("manage-profiles.png"), fullPage: true });
  const secondTab = await context.newPage();
  await secondTab.goto("/settings/profiles");
  await expect(secondTab.getByRole("button", { name: "Add profile" })).toBeVisible();
  await page.getByRole("button", { name: "Switch profile" }).click();
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await expect(secondTab.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await page.getByRole("button", { name: "Browser Member Open", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Access", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add profile" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await expect(secondTab.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await fillProfilePin(page, "New profile PIN", "0456");
  await fillProfilePin(page, "Confirm profile PIN", "9876");
  await page.getByRole("button", { name: "Set PIN", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Confirm profile PIN", exact: true }).locator("input").first(),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("PINs do not match")).toBeVisible();
  await fillProfilePin(page, "Confirm profile PIN", "0456");
  await page.getByRole("button", { name: "Set PIN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Browser Member Locked", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browser Member Locked", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("profile-pin-mobile.png"), fullPage: true });
  await fillProfilePin(page, "Profile PIN", "0456");
  await page.getByRole("button", { name: "Unlock profile" }).click();
  await page.goto("/settings/access");
  await expect(page.getByRole("link", { name: "Access", exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Only an admin profile can change the shared app password."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Change password", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch profile" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("member-mobile.png"), fullPage: true });
  await secondTab.close();
});
