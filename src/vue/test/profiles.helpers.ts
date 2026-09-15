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
        data: { password: "test-admin-password" },
      })
    ).status(),
  ).toBe(200);
}
