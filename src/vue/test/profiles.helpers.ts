import { expect, type Page } from "@playwright/test";
import { z } from "zod";
export async function selectBrowserAdmin(page: Page): Promise<void> {
  // The API request client omits Secure cookies on HTTP loopback; Chromium accepts them there.
  const cookie = (await page.context().cookies())
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
  const headers = { cookie };
  const profiles = z
    .array(z.object({ id: z.string(), role: z.string() }))
    .parse(await (await page.request.get("/api/profiles", { headers })).json());
  const profile = profiles.find((entry) => entry.role === "admin");
  if (!profile) throw new Error("Missing admin profile");
  expect(
    (
      await page.request.post(`/api/profiles/${profile.id}/select`, {
        headers,
        data: { pin: "0123" },
      })
    ).status(),
  ).toBe(200);
}

export async function fillProfilePin(page: Page, label: string, pin: string): Promise<void> {
  const boxes = page.getByRole("group", { name: label, exact: true }).locator("input");
  await expect(boxes).toHaveCount(4);
  for (let index = 0; index < 4; index++) await boxes.nth(index).fill(pin[index] ?? "");
}
