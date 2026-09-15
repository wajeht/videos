import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp, type AppType } from "../app.js";
import { createConfiguration } from "../config.js";
import { createTestContext } from "../test/resources.js";
import { testAdminPassword } from "../test/auth.js";

const appPassword = "shared-library-password";
const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["admin", "member"]),
  isLocked: z.boolean(),
});
type Body = Record<string, string | number | boolean | null>;
async function createClient(app: AppType) {
  const login = await app.request("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: appPassword }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  let selectionKey = "";
  async function request(url: string, method = "GET", body?: Body) {
    return app.request(url, {
      method,
      headers: { cookie, "content-type": "application/json", "x-profile-selection": selectionKey },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function select(id: string, password = "") {
    const response = await request(`/api/profiles/${id}/select`, "POST", { password });
    if (response.ok) {
      const state = z
        .object({ profileSelectionKey: z.string() })
        .parse(await (await request("/api/auth/me")).json());
      selectionKey = state.profileSelectionKey;
    }
    return response;
  }
  return { request, select, cookie, selection: () => selectionKey };
}
async function fixture() {
  const context = await createTestContext(createConfiguration({ APP_ENV: "testing" }));
  await context.auth.setupPassword(appPassword);
  await context.auth.setupAdminProfile("Admin", testAdminPassword);
  const app = createApp(context);
  const admin = (await context.profiles.listProfiles())[0]!;
  const client = await createClient(app);
  expect((await client.select(admin.id, testAdminPassword)).status).toBe(200);
  async function addProfile(name: string, password: string | null = null) {
    const response = await client.request("/api/profiles", "POST", {
      name,
      password,
    });
    expect(response.status).toBe(201);
    return profileSchema.parse(await response.json());
  }
  return { context, app, admin, client, addProfile };
}

describe("profiles", () => {
  it("saves the app password before creating exactly one first admin", async () => {
    const context = await createTestContext(createConfiguration({ APP_ENV: "testing" }));
    const passwords = await Promise.all([
      context.auth.setupPassword(appPassword),
      context.auth.setupPassword(appPassword),
    ]);
    expect(passwords.filter((result) => result.ok)).toHaveLength(1);
    expect(await context.profiles.listProfiles()).toHaveLength(0);
    const results = await Promise.all([
      context.auth.setupAdminProfile("First", testAdminPassword),
      context.auth.setupAdminProfile("Second", testAdminPassword),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const profiles = await context.profiles.listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ role: "admin", isLocked: true });
    expect(await context.database.connection("profile_settings")).toHaveLength(1);
  });

  it("requires app access, profile selection, and admin permission at their respective boundaries", async () => {
    const { app, admin, client, addProfile } = await fixture();
    expect((await app.request("/api/profiles")).status).toBe(401);
    const guest = await createClient(app);
    expect((await guest.request("/api/profiles")).status).toBe(200);
    expect((await guest.request("/api/library")).status).toBe(409);
    expect(
      (
        await guest.request("/api/profiles", "POST", {
          name: "Intruder",
          role: "admin",
          password: testAdminPassword,
        })
      ).status,
    ).toBe(409);
    const member = await addProfile("Member");
    expect((await guest.select(member.id)).status).toBe(200);
    expect(
      (
        await guest.request("/api/profiles", "POST", {
          name: "Intruder",
          password: null,
        })
      ).status,
    ).toBe(403);
    expect((await guest.request(`/api/profiles/${admin.id}`, "DELETE")).status).toBe(403);
    expect(
      (
        await guest.request(`/api/profiles/${admin.id}/password`, "PUT", {
          password: "different-password",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await guest.request("/api/auth/password", "PUT", {
          currentPassword: appPassword,
          newPassword: "changed-app-password",
          confirmPassword: "changed-app-password",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await guest.request(`/api/profiles/${member.id}`, "PUT", {
          name: "Promoted",
          role: "admin",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await guest.request(`/api/profiles/${member.id}`, "PUT", {
          name: "My name",
        })
      ).status,
    ).toBe(200);
    const profiles = await (await client.request("/api/profiles")).json();
    expect(JSON.stringify(profiles)).not.toContain("password_hash");
    expect(JSON.stringify(profiles)).not.toContain(testAdminPassword);
  });

  it("keeps one immutable admin and creates only member profiles", async () => {
    const { client, admin, addProfile, context } = await fixture();
    expect((await client.request(`/api/profiles/${admin.id}`, "DELETE")).status).toBe(409);
    expect(
      (
        await client.request(`/api/profiles/${admin.id}`, "PUT", {
          name: "Admin",
          role: "member",
        })
      ).status,
    ).toBe(400);
    expect(
      (await client.request(`/api/profiles/${admin.id}/password`, "PUT", { password: null }))
        .status,
    ).toBe(400);
    for (const password of [null, testAdminPassword]) {
      expect(
        (
          await client.request("/api/profiles", "POST", {
            name: "Extra admin",
            role: "admin",
            password,
          })
        ).status,
      ).toBe(400);
    }
    const member = await addProfile("Member", testAdminPassword);
    expect(member.role).toBe("member");
    expect(
      (
        await client.request(`/api/profiles/${member.id}`, "PUT", {
          name: "Promoted",
          role: "admin",
        })
      ).status,
    ).toBe(400);
    expect(
      (await client.request(`/api/profiles/${admin.id}`, "PUT", { name: "Owner" })).status,
    ).toBe(200);
    expect(await context.profiles.findProfile(admin.id)).toMatchObject({
      name: "Owner",
      role: "admin",
    });
    await expect(
      context.database.connection("profiles").where({ id: member.id }).update({ role: "admin" }),
    ).rejects.toThrow("UNIQUE constraint failed: profiles.role");
    expect(
      (await context.profiles.listProfiles()).filter((profile) => profile.role === "admin"),
    ).toHaveLength(1);
  });

  it("isolates progress, next videos, completion totals, preferences, and resets", async () => {
    const { app, client, context, addProfile } = await fixture();
    const member = await addProfile("Member");
    const other = await createClient(app);
    await other.select(member.id);
    const playlistId = "a".repeat(24);
    const firstVideo = "b".repeat(24);
    const secondVideo = "c".repeat(24);
    await context.database
      .connection("playlists")
      .insert({ id: playlistId, path: "Playlist", title: "Playlist", sort_order: 0 });
    for (const [index, id] of [firstVideo, secondVideo].entries()) {
      await context.database.connection("videos").insert({
        id,
        playlist_id: playlistId,
        path: `Playlist/${index}.mp4`,
        title: `Video ${index}`,
        sort_order: index,
        duration_seconds: 100,
        size_bytes: 100,
        container: "mp4",
        video_codec: "h264",
        browser_compatible: true,
        modified_at: new Date().toISOString(),
      });
    }
    expect(
      (await client.request(`/api/progress/videos/${firstVideo}/complete`, "POST")).status,
    ).toBe(200);
    expect(
      (await client.request(`/api/progress/videos/${secondVideo}`, "PUT", { positionSeconds: 30 }))
        .status,
    ).toBe(200);
    await other.request(`/api/progress/videos/${firstVideo}`, "PUT", { positionSeconds: 10 });
    await client.request("/api/settings", "PUT", { libraryPageSize: 48 });
    expect(await (await other.request("/api/settings")).json()).toEqual({ libraryPageSize: 24 });
    expect(await (await client.request("/api/library")).json()).toMatchObject({
      playlists: [{ completedCount: 1, durationSeconds: 200, nextVideoId: secondVideo }],
      continueWatching: [{ id: secondVideo, positionSeconds: 30 }],
      pagination: { pageSize: 48 },
    });
    expect(await (await other.request("/api/library")).json()).toMatchObject({
      playlists: [{ completedCount: 0, durationSeconds: 200, nextVideoId: firstVideo }],
      continueWatching: [{ id: firstVideo, positionSeconds: 10 }],
    });
    expect(await (await other.request(`/api/videos/${firstVideo}`)).json()).toMatchObject({
      video: { positionSeconds: 10, completed: false },
    });
    await other.request(`/api/progress/playlists/${playlistId}`, "DELETE");
    expect(await (await other.request("/api/library")).json()).toMatchObject({
      continueWatching: [],
    });
    expect(await (await client.request("/api/library")).json()).toMatchObject({
      continueWatching: [{ id: secondVideo, positionSeconds: 30 }],
    });
    await client.request(`/api/profiles/${member.id}`, "DELETE");
    expect(
      await context.database.connection("profile_settings").where({ profile_id: member.id }),
    ).toEqual([]);
    expect((await other.request("/api/settings")).status).toBe(409);
  });

  it("rejects stale tab writes and re-locks all sessions when a password changes", async () => {
    const { app, context, client, addProfile } = await fixture();
    const locked = await addProfile("Locked", "member-password");
    const other = await createClient(app);
    expect((await other.select(locked.id, appPassword)).status).toBe(403);
    await other.select(locked.id, "member-password");
    const oldSelection = other.selection();
    const open = await addProfile("Open");
    await other.select(open.id);
    const stale = await app.request("/api/settings", {
      method: "PUT",
      headers: {
        cookie: other.cookie,
        "x-profile-selection": oldSelection,
        "content-type": "application/json",
      },
      body: JSON.stringify({ libraryPageSize: 96 }),
    });
    expect(stale.status).toBe(409);
    const staleProgress = await app.request(`/api/progress/videos/${"a".repeat(24)}`, {
      method: "PUT",
      headers: {
        cookie: other.cookie,
        "x-profile-selection": oldSelection,
        "content-type": "application/json",
      },
      body: JSON.stringify({ positionSeconds: 50 }),
    });
    expect(staleProgress.status).toBe(409);
    expect(await (await other.request("/api/settings")).json()).toEqual({ libraryPageSize: 24 });
    await other.select(locked.id, "member-password");
    await client.request(`/api/profiles/${locked.id}/password`, "PUT", {
      password: "replacement-password",
    });
    expect((await other.request("/api/library")).status).toBe(409);
    expect((await other.select(locked.id, "member-password")).status).toBe(403);
    expect((await other.select(locked.id, "replacement-password")).status).toBe(200);
    const profileBeforeReset = await context.profiles.findProfile(locked.id);
    await client.request(`/api/profiles/${locked.id}/password`, "PUT", {
      password: "another-password",
    });
    const storedSession = await context.database
      .connection("auth_sessions")
      .where({ profile_id: null })
      .first();
    expect(
      await context.profiles.selectProfile(storedSession.session_key, profileBeforeReset!),
    ).toBe(false);
  });

  it("validates profile passwords before storing them and permits members to remove locks", async () => {
    const { client, admin, context, addProfile } = await fixture();
    const freshContext = await createTestContext(createConfiguration({ APP_ENV: "testing" }));
    await freshContext.auth.setupPassword(appPassword);
    const freshApp = createApp(freshContext);
    const setupClient = await createClient(freshApp);
    for (const password of ["short", "a".repeat(73), "😀".repeat(18) + "x", 1234, null]) {
      const setup = await setupClient.request("/api/auth/admin-profile", "POST", {
        name: "Admin",
        password,
      });
      expect(setup.status).toBe(400);
      expect(
        (
          await client.request("/api/profiles", "POST", {
            name: "Invalid member",
            password,
          })
        ).status,
      ).toBe(password === null ? 201 : 400);
      expect(
        (await client.request(`/api/profiles/${admin.id}/password`, "PUT", { password })).status,
      ).toBe(400);
    }
    expect(await freshContext.profiles.listProfiles()).toEqual([]);
    expect(await freshContext.auth.isPasswordConfigured()).toBe(true);
    const locked = await addProfile("Protected", "abcdefgh");
    const row = await context.profiles.findProfile(locked.id);
    expect(row?.password_hash).not.toBe("abcdefgh");
    expect(row?.password_hash).toMatch(/^\$2/);
    expect((await client.select(locked.id, "abcdefgh")).status).toBe(200);
    expect(
      (await client.request(`/api/profiles/${locked.id}/password`, "PUT", { password: null }))
        .status,
    ).toBe(200);
    expect((await client.select(locked.id)).status).toBe(200);
  });

  it("rate limits incorrect password guesses across sessions", async () => {
    const { app, addProfile } = await fixture();
    const profile = await addProfile("Locked", "member-password");
    const other = await createClient(app);
    for (let index = 0; index < 5; index++)
      expect((await other.select(profile.id, "wrong-password")).status).toBe(403);
    const another = await createClient(app);
    const blocked = await another.select(profile.id, "member-password");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    const unicode = await addProfile("Unicode", "😀".repeat(18));
    expect((await another.select(unicode.id, "😀".repeat(18))).status).toBe(200);
    expect((await another.select(unicode.id, "😀".repeat(18) + "x")).status).toBe(400);
  });
});
