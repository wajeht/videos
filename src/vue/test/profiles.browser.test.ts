import { expect, test } from "@playwright/test";

// Exercise the real session cookies, profile permissions, and cross-tab switch behavior.
test("selects locked profiles and limits profile management to admins", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if (await page.getByRole("heading", { name: "Set up your library" }).isVisible()) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Step 1 of 2 · Library password")).toBeVisible();
    await expect(page.getByLabel(/^Profile name/)).toHaveCount(0);
    await page.getByLabel(/^Setup token/).fill("videos-playwright-setup-token");
    await page.getByLabel(/^Password/).fill("playwright-password");
    await page.getByLabel(/^Confirm password/).fill("a-different-password");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Passwords do not match")).toBeVisible();
    await page.getByLabel(/^Confirm password/).fill("playwright-password");
    await page.screenshot({
      path: testInfo.outputPath("setup-library-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Step 2 of 2 · Admin profile")).toBeVisible();
    await expect(page.getByLabel(/^Profile name/)).toBeFocused();
    await expect(page.getByLabel(/^Password/)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Step 2 of 2 · Admin profile")).toBeVisible();
    await expect(page.getByLabel(/^Password/)).toHaveCount(0);
    await expect(page.getByLabel(/^Setup token/)).toHaveCount(0);
    await page.getByLabel(/^Profile name/).fill("Admin");
    await page.getByLabel(/^Admin profile password/).fill("test-admin-password");
    await page.getByLabel(/^Confirm admin profile password/).fill("test-admin-password");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("setup-admin-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "Finish setup", exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 720 });
  } else {
    await page.getByLabel(/^Password/).fill("playwright-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
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
  await expect(
    page.getByRole("navigation", { name: "Main navigation", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch profile" })).toHaveCount(0);
  await page.goto("/settings/profiles");
  await expect(page.getByRole("link", { name: "Access", exact: true })).toBeVisible();
  await expect(page.locator("#settings-profiles-panel > fieldset > legend")).toHaveCount(1);
  await page.getByRole("link", { name: "Add profile" }).click();
  await expect(page).toHaveURL(/\/settings\/profiles\/new$/);
  await expect(page.getByLabel("Permissions", { exact: true })).toHaveCount(0);
  await page.getByLabel(/^Profile name/).fill("Browser Member");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "Browser Member", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Profile created" })).toBeVisible();
  const adminLink = page.getByRole("link", { name: "Edit Admin", exact: true });
  const memberLink = page.getByRole("link", { name: "Edit Browser Member", exact: true });
  await expect(memberLink).toContainText("Member · No password");
  await expect(adminLink).toContainText("Admin · Password protected");
  await expect(page.getByRole("button", { name: "Delete profile", exact: true })).toHaveCount(0);
  const adminEditPath = (await adminLink.getAttribute("href"))!;
  const memberEditPath = (await memberLink.getAttribute("href"))!;
  await adminLink.click();
  await expect(page.getByRole("heading", { name: "Edit Admin", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete profile", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(memberEditPath).toMatch(/^\/settings\/profiles\/[^/]+\/edit$/);
  await memberLink.click();
  await expect(page).toHaveURL(new RegExp(`${memberEditPath}$`));
  await expect(page.getByRole("heading", { name: "Edit Browser Member" })).toBeVisible();
  await expect(page.getByLabel("Permissions", { exact: true })).toHaveCount(0);
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
  await expect(page.getByLabel("Permissions", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profiles$/);
  await memberLink.click();
  await page.getByLabel(/^Profile name/).fill("Browser Viewer");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profiles$/);
  await expect(page.getByRole("heading", { name: "Browser Viewer", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Profile updated" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss Profile updated", exact: true }).click();
  const profileList = page.getByRole("list", { name: "Profiles", exact: true });
  const profileRows = await profileList.getByRole("link").all();
  await page.screenshot({ path: testInfo.outputPath("manage-profiles.png"), fullPage: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const firstCard = (await profileRows[0]!.boundingBox())!;
    const secondCard = (await profileRows[1]!.boundingBox())!;
    expect(secondCard.y).toBeGreaterThanOrEqual(firstCard.y + firstCard.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const addButton = (await page.getByRole("link", { name: "Add profile" }).boundingBox())!;
    expect(addButton.width).toBe((await profileList.boundingBox())!.width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("manage-profiles-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/settings/profiles/missing/edit");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save profile", exact: true })).toHaveCount(0);
  await page.goto("/settings/profiles");
  await page.getByRole("link", { name: "Add profile" }).click();
  await page.getByLabel(/^Profile name/).fill("Temporary profile");
  await page.getByRole("button", { name: "Create profile" }).click();
  const temporaryProfile = page.getByRole("link", { name: "Edit Temporary profile", exact: true });
  await temporaryProfile.click();
  const deletePanel = page
    .locator("fieldset")
    .filter({
      has: page.getByRole("heading", { name: "Delete profile", exact: true }),
    })
    .last();
  await expect(
    deletePanel.getByRole("button", { name: "Delete profile", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete profile", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit Temporary profile", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Profile deleted" })).toHaveCount(0);
  await page.route(
    "**/api/profiles/*",
    async (route) => {
      await route.fulfill({ status: 500, json: { message: "Could not delete profile" } });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Delete profile", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete profile", exact: true })
    .click();
  await expect(deletePanel.getByRole("alert")).toHaveText("Could not delete profile");
  await expect(
    page.getByRole("heading", { name: "Edit Temporary profile", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete profile", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete profile", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/profiles$/);
  await expect(temporaryProfile).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Profile deleted" })).toBeVisible();
  const secondTab = await context.newPage();
  await secondTab.goto("/settings/profiles");
  await expect(secondTab.getByRole("link", { name: "Add profile" })).toBeVisible();
  await page.getByRole("button", { name: "Switch profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await expect(secondTab.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await page.getByRole("button", { name: "Browser Viewer Open", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profile details" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Access", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Refresh library" })).toBeVisible();
  await expect(page.locator("[data-library-status]")).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
    "href",
    "/settings/library",
  );
  await expect(page.getByRole("button", { name: "Refresh library", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Profiles", exact: true }).click();
  await expect(page.getByRole("link", { name: "Add profile" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete profile", exact: true })).toHaveCount(0);
  await expect(secondTab.getByRole("heading", { name: "Profile details" })).toBeVisible();
  for (const path of [adminEditPath, "/settings/profiles/new"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create profile", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save profile", exact: true })).toHaveCount(0);
  }
  await page.goto("/settings/profiles");
  await expect(page.getByRole("link", { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
  await expect(page.locator("#settings-profiles-panel > fieldset > legend")).toHaveCount(2);
  await page.getByLabel(/^Profile name/).fill("Renamed Member");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile updated" })).toBeVisible();
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
  await expect(page.locator("#settings-profiles-panel > fieldset > legend")).toHaveCount(2);
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
  await expect(page.getByRole("button", { name: "Switch profile" })).toHaveCount(0);
  await page.goto("/settings/profiles");
  const switchButton = page.getByRole("button", { name: "Switch profile", exact: true });
  await expect(switchButton).toBeVisible();
  const switchBox = await switchButton.boundingBox();
  const signOutBox = await page
    .getByRole("button", { name: "Sign out", exact: true })
    .boundingBox();
  expect(switchBox!.width).toBe(signOutBox!.width);
  expect(switchBox!.y).toBeLessThan(signOutBox!.y);
  await switchButton.click();
  await expect(page.getByRole("heading", { name: "Who’s watching?" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("member-mobile.png"), fullPage: true });
  await secondTab.close();
});
