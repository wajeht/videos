import { z } from "zod";
import type { AppType } from "../app.js";

export const testAdminPin = "0123";
export async function selectTestAdmin(app: AppType, cookie: string): Promise<string> {
  const profiles = z
    .array(z.object({ id: z.string(), role: z.string() }))
    .parse(await (await app.request("/api/profiles", { headers: { cookie } })).json());
  const admin = profiles.find((profile) => profile.role === "admin");
  if (!admin) throw new Error("Missing test admin");
  const selected = await app.request(`/api/profiles/${admin.id}/select`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ pin: testAdminPin }),
  });
  if (!selected.ok) throw new Error(await selected.text());
  const state = z
    .object({ profileSelectionKey: z.string() })
    .parse(await (await app.request("/api/auth/me", { headers: { cookie } })).json());
  return state.profileSelectionKey;
}
