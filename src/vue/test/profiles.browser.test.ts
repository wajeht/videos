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
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Unlock Admin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await page.getByLabel(/^Profile password/).fill("wrong-password");
  await page.getByRole("button", { name: "Unlock profile" }).click();
  await expect(page.getByLabel(/^Profile password/)).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel(/^Profile password/).fill("test-admin-password");
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
  await expect(page.locator("#settings-profiles-panel > section > header")).toHaveCount(1);
  await page.getByRole("link", { name: "Add profile" }).click();
  await expect(page).toHaveURL(/\/settings\/profiles\/new$/);
  await page.getByLabel(/^Profile name/).fill("Browser Member");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "Browser Member", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Profile created" })).toBeVisible();
  const editLinks = page.getByRole("link", { name: "Edit", exact: true });
  const adminEditPath = (await editLinks.first().getAttribute("href"))!;
  const memberEditPath = (await editLinks.nth(1).getAttribute("href"))!;
  expect(memberEditPath).toMatch(/^\/settings\/profiles\/[^/]+\/edit$/);
  await editLinks.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`${memberEditPath}$`));
  await expect(page.getByRole("heading", { name: "Edit Browser Member" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Profiles", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.reload();
  await expect(page.getByLabel(/^Profile name/)).toHaveValue("Browser Member");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Manage profiles" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Edit Browser Member" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profiles$/);
  await page.getByRole("link", { name: "Edit", exact: true }).nth(1).click();
  await page.getByLabel(/^Profile name/).fill("Browser Viewer");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profiles$/);
  await expect(page.getByRole("heading", { name: "Browser Viewer", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Profile updated" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("manage-profiles.png"), fullPage: true });
  await page.goto("/settings/profiles/missing/edit");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save profile", exact: true })).toHaveCount(0);
  await page.goto("/settings/profiles");
  await page.getByRole("link", { name: "Add profile" }).click();
  await page.getByLabel(/^Profile name/).fill("Temporary profile");
  await page.getByRole("button", { name: "Create profile" }).click();
  const temporaryProfile = page.getByRole("row").filter({ hasText: "Temporary profile" });
  await temporaryProfile.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(temporaryProfile).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Profile deleted" })).toHaveCount(0);
  await temporaryProfile.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete profile", exact: true })
    .click();
  await expect(temporaryProfile).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Profile deleted" })).toBeVisible();
  const secondTab = await context.newPage();
  await secondTab.goto("/settings/profiles");
  await expect(secondTab.getByRole("link", { name: "Add profile" })).toBeVisible();
  await page.getByRole("button", { name: "Switch profile" }).click();
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await expect(secondTab.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await page.getByRole("button", { name: "Browser Viewer Open", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profile details" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Access", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add profile" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await expect(secondTab.getByRole("heading", { name: "Profile details" })).toBeVisible();
  for (const path of [adminEditPath, "/settings/profiles/new"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create profile", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save profile", exact: true })).toHaveCount(0);
  }
  await page.goto("/settings/profiles");
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
  await expect(page.locator("#settings-profiles-panel > section > header")).toHaveCount(2);
  await page.getByLabel(/^Profile name/).fill("Renamed Member");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("button", { name: "Switch profile" })).toHaveText("Renamed Member");
  await secondTab.reload();
  await expect(secondTab.getByLabel(/^Profile name/)).toHaveValue("Renamed Member");
  await page.reload();
  await expect(page.getByLabel(/^Profile name/)).toHaveValue("Renamed Member");
  await expect(page.getByLabel("Avatar color")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Profile lock" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("member-profile-settings.png"),
    fullPage: true,
  });
  await page.getByLabel(/^New profile password/).fill("member-password");
  await page.getByLabel(/^Confirm profile password/).fill("different-password");
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  await expect(page.getByLabel(/^Confirm profile password/)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByText("Passwords do not match")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Profile password updated" }),
  ).toHaveCount(0);
  await page.getByLabel(/^Confirm profile password/).fill("member-password");
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Profile password updated" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Renamed Member Locked", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Renamed Member Locked", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("profile-password-mobile.png"),
    fullPage: true,
  });
  await page.getByLabel(/^Profile password/).fill("member-password");
  await page.getByRole("button", { name: "Unlock profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile details" })).toBeVisible();
  await expect(page.locator("#settings-profiles-panel > section > header")).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("member-profile-settings-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Remove lock", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile lock removed" })).toBeVisible();
  await page.getByRole("button", { name: "Renamed Member Open", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profile details" })).toBeVisible();
  await page.goto("/settings/access");
  await expect(page.getByRole("link", { name: "Access", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.locator("#settings-access-panel")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change password", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch profile" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("member-mobile.png"), fullPage: true });
  await secondTab.close();
});
