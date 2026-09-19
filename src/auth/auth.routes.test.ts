import { selectTestAdmin, testAdminPassword } from "../test/auth.js";
import path from "node:path";

import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { createConfiguration } from "../config.js";
import type { AppContext } from "../context.js";
import {
  closeTestDatabase,
  createTemporaryDirectory,
  createTestContext,
} from "../test/resources.js";

type JsonRequestBody = Record<string, boolean | null | number | string | undefined>;

async function testApp(
  options: { maxAttempts?: number; idleTimeoutMs?: number; dataDirectory?: string } = {},
) {
  const baseConfiguration = createConfiguration({
    APP_ENV: "testing",
    LOGIN_MAX_ATTEMPTS: String(options.maxAttempts ?? 5),
    SESSION_IDLE_TIMEOUT_MS: String(options.idleTimeoutMs ?? 60_000),
  });
  const configuration = options.dataDirectory
    ? {
        ...baseConfiguration,
        database: { filename: path.join(options.dataDirectory, "videos.sqlite") },
      }
    : baseConfiguration;
  const context = await createTestContext(configuration);
  return { app: createApp(context), context };
}

async function closeContext(context: AppContext): Promise<void> {
  await closeTestDatabase(context.database);
}

function jsonRequest(
  method: string,
  body: JsonRequestBody,
  cookie?: string,
  selectionKey?: string,
): RequestInit {
  const headers = new Headers({ "content-type": "application/json" });
  if (selectionKey) headers.set("x-profile-selection", selectionKey);
  if (cookie) headers.set("cookie", cookie);
  return {
    method,
    headers,
    body: JSON.stringify(body),
  };
}

describe("password authentication", () => {
  it("persists library setup across restart and only permits one authenticated first admin", async () => {
    const dataDirectory = await createTemporaryDirectory("videos-setup-checkpoint-");
    const first = await testApp({ dataDirectory });
    const adminInput = { name: "Owner", password: testAdminPassword };
    expect(
      (await first.app.request("/api/auth/admin-profile", jsonRequest("POST", adminInput))).status,
    ).toBe(401);
    expect(
      (
        await first.app.request(
          "/api/auth/password",
          jsonRequest("POST", {
            password: "test-videos-password",
            confirmPassword: "test-videos-password",
          }),
        )
      ).status,
    ).toBe(201);
    const login = await first.app.request(
      "/api/auth",
      jsonRequest("POST", { password: "test-videos-password" }),
    );
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    expect(await first.context.profiles.listProfiles()).toEqual([]);
    await closeContext(first.context);

    const second = await testApp({ dataDirectory });
    const state = await (await second.app.request("/api/auth/me", { headers: { cookie } })).json();
    expect(state).toMatchObject({
      authenticated: true,
      passwordConfigured: true,
      adminProfileRequired: true,
    });
    expect(
      (
        await second.app.request(
          "/api/auth/password",
          jsonRequest("POST", {
            password: "another-library-password",
            confirmPassword: "another-library-password",
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await second.app.request("/api/auth/admin-profile", jsonRequest("POST", adminInput))).status,
    ).toBe(401);
    expect(
      (
        await second.app.request(
          "/api/auth/admin-profile",
          jsonRequest("POST", { ...adminInput, role: "member" }, cookie),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await second.app.request(
          "/api/auth/admin-profile",
          jsonRequest("POST", { name: "Owner", password: "short" }, cookie),
        )
      ).status,
    ).toBe(400);
    expect(
      (await second.app.request("/api/auth/admin-profile", jsonRequest("POST", adminInput, cookie)))
        .status,
    ).toBe(201);
    expect(
      (
        await second.app.request(
          "/api/auth/admin-profile",
          jsonRequest("POST", { ...adminInput, name: "Another admin" }, cookie),
        )
      ).status,
    ).toBe(409);
    expect(await second.context.profiles.listProfiles()).toMatchObject([
      { name: "Owner", role: "admin", isLocked: true },
    ]);
    expect(await second.context.auth.isPasswordValid("test-videos-password")).toBe(true);
    expect(
      await (await second.app.request("/api/auth/me", { headers: { cookie } })).json(),
    ).toMatchObject({ adminProfileRequired: false });
  });

  it("sets up a password, signs in, protects APIs, changes the password, and signs out", async () => {
    const { app } = await testApp();

    expect(await (await app.request("/api/auth/me")).json()).toEqual({
      authenticated: false,
      adminProfileRequired: false,
      profile: null,
      profileSelectionKey: null,
      passwordConfigured: false,
      setupEnabled: true,
      setupTokenRequired: false,
    });
    expect((await app.request("/api/library")).status).toBe(401);

    expect(
      (
        await app.request(
          "/api/auth/password",
          jsonRequest("POST", {
            password: "test-videos-password",
            confirmPassword: "test-videos-password",
          }),
        )
      ).status,
    ).toBe(201);

    const badLogin = await app.request(
      "/api/auth",
      jsonRequest("POST", { password: "wrong-videos-password" }),
    );
    expect(badLogin.status).toBe(401);

    const login = await app.request(
      "/api/auth",
      jsonRequest("POST", { password: "test-videos-password" }),
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toMatch(/^videos_session=/);
    expect(
      (
        await app.request(
          "/api/auth/admin-profile",
          jsonRequest(
            "POST",
            {
              name: "Admin",
              password: testAdminPassword,
            },
            cookie,
          ),
        )
      ).status,
    ).toBe(201);
    const selectionKey = await selectTestAdmin(app, cookie!);

    const library = await app.request("/api/library", {
      headers: { cookie: cookie!, "x-profile-selection": selectionKey },
    });
    expect(library.status).toBe(200);
    const playbackPath = "/api/playback/000000000000000000000000";
    expect(
      (
        await app.request(playbackPath, {
          headers: {
            cookie: cookie!,
            "x-profile-selection": selectionKey,
            "sec-fetch-site": "same-site",
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(playbackPath, {
          headers: {
            cookie: cookie!,
            "x-profile-selection": selectionKey,
            "sec-fetch-site": "same-origin",
          },
        })
      ).status,
    ).toBe(404);

    const otherLogin = await app.request(
      "/api/auth",
      jsonRequest("POST", { password: "test-videos-password" }),
    );
    const otherCookie = otherLogin.headers.get("set-cookie")?.split(";")[0];
    expect(otherCookie).toMatch(/^videos_session=/);

    const change = await app.request(
      "/api/auth/password",
      jsonRequest(
        "PUT",
        {
          currentPassword: "test-videos-password",
          newPassword: "new-test-password",
          confirmPassword: "new-test-password",
        },
        cookie,
        selectionKey,
      ),
    );
    expect(change.status).toBe(200);
    const refreshedCookie = change.headers.get("set-cookie")?.split(";")[0];
    expect(refreshedCookie).toMatch(/^videos_session=/);
    const refreshedSelection = await selectTestAdmin(app, refreshedCookie!);
    expect(
      (
        await app.request("/api/library", {
          headers: { cookie: cookie!, "x-profile-selection": selectionKey },
        })
      ).status,
    ).toBe(401);
    expect((await app.request("/api/library", { headers: { cookie: otherCookie! } })).status).toBe(
      401,
    );
    expect(
      (
        await app.request("/api/library", {
          headers: { cookie: refreshedCookie!, "x-profile-selection": refreshedSelection },
        })
      ).status,
    ).toBe(200);

    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: refreshedCookie!,
        "x-profile-selection": refreshedSelection,
        origin: "http://localhost",
      },
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(
      (
        await app.request("/api/library", {
          headers: { cookie: refreshedCookie!, "x-profile-selection": refreshedSelection },
        })
      ).status,
    ).toBe(401);

    expect(
      (await app.request("/api/auth", jsonRequest("POST", { password: "test-videos-password" })))
        .status,
    ).toBe(401);
    expect(
      (await app.request("/api/auth", jsonRequest("POST", { password: "new-test-password" })))
        .status,
    ).toBe(200);
  });

  it("blocks repeated failed logins", async () => {
    const { app, context } = await testApp({ maxAttempts: 2 });
    await context.auth.setupPassword("test-videos-password");
    await context.auth.setupAdminProfile("Admin", testAdminPassword);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(
        (await app.request("/api/auth", jsonRequest("POST", { password: "wrong-videos-password" })))
          .status,
      ).toBe(401);
    }

    const blocked = await app.request(
      "/api/auth",
      jsonRequest("POST", { password: "test-videos-password" }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("reserves concurrent login attempts before verifying passwords", async () => {
    const { app, context } = await testApp({ maxAttempts: 2 });
    await context.auth.setupPassword("test-videos-password");
    let releaseVerification!: (matches: boolean) => void;
    const verification = new Promise<boolean>((resolve) => {
      releaseVerification = resolve;
    });
    const compare = vi.spyOn(bcrypt, "compare").mockImplementation(() => verification);
    let blocked = 0;
    const requests = Array.from({ length: 4 }, async () => {
      const response = await app.request(
        "/api/auth",
        jsonRequest("POST", { password: "wrong-videos-password" }),
      );
      if (response.status === 429) blocked++;
      return response;
    });
    try {
      await expect.poll(() => blocked).toBe(2);
      expect(compare).toHaveBeenCalledTimes(2);
    } finally {
      releaseVerification(false);
      await Promise.all(requests);
      compare.mockRestore();
    }
    expect((await Promise.all(requests)).map((response) => response.status).sort()).toEqual([
      401, 401, 429, 429,
    ]);
  });

  it("allows login attempts again after the reserved attempt window expires", async () => {
    const { app, context } = await testApp({ maxAttempts: 1 });
    await context.auth.setupPassword("test-videos-password");
    const request = () =>
      app.request("/api/auth", jsonRequest("POST", { password: "wrong-videos-password" }));
    expect((await request()).status).toBe(401);
    expect((await request()).status).toBe(429);
    await context.database.connection("auth_login_attempts").update({ reset_at: Date.now() - 1 });
    expect((await request()).status).toBe(401);
    expect((await request()).status).toBe(429);
  });

  it("rejects a login verified against the password replaced while it was pending", async () => {
    const { app, context } = await testApp();
    await context.auth.setupPassword("test-videos-password");
    await context.auth.setupAdminProfile("Admin", testAdminPassword);
    const login = await app.request(
      "/api/auth",
      jsonRequest("POST", { password: "test-videos-password" }),
    );
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const selectionKey = await selectTestAdmin(app, cookie);
    let markVerified!: () => void;
    const verified = new Promise<void>((resolve) => {
      markVerified = resolve;
    });
    let resumeVerification!: () => void;
    const resume = new Promise<void>((resolve) => {
      resumeVerification = resolve;
    });
    const originalCompare = bcrypt.compare;
    const compare = vi.spyOn(bcrypt, "compare").mockImplementationOnce(async (password, hash) => {
      const matches = await originalCompare(password, hash);
      markVerified();
      await resume;
      return matches;
    });
    const pendingLogin = app.request(
      "/api/auth",
      jsonRequest("POST", { password: "test-videos-password" }),
    );
    try {
      await verified;
      const change = await app.request(
        "/api/auth/password",
        jsonRequest(
          "PUT",
          {
            currentPassword: "test-videos-password",
            newPassword: "replacement-password",
            confirmPassword: "replacement-password",
          },
          cookie,
          selectionKey,
        ),
      );
      expect(change.status).toBe(200);
      expect(change.headers.get("set-cookie")).toBeTruthy();
    } finally {
      resumeVerification();
      await pendingLogin;
      compare.mockRestore();
    }
    const staleLogin = await pendingLogin;
    expect(staleLogin.status).toBe(401);
    expect(staleLogin.headers.get("set-cookie")).toBeNull();
    expect(await context.database.connection("auth_sessions")).toHaveLength(1);
  });

  it("clears persisted failures after a successful login", async () => {
    const { app, context } = await testApp({ maxAttempts: 2 });
    await context.auth.setupPassword("test-videos-password");
    await context.auth.setupAdminProfile("Admin", testAdminPassword);

    expect(
      (await app.request("/api/auth", jsonRequest("POST", { password: "wrong-videos-password" })))
        .status,
    ).toBe(401);
    expect(
      (await app.request("/api/auth", jsonRequest("POST", { password: "test-videos-password" })))
        .status,
    ).toBe(200);
    expect(
      (await app.request("/api/auth", jsonRequest("POST", { password: "wrong-videos-password" })))
        .status,
    ).toBe(401);
    expect(
      (await app.request("/api/auth", jsonRequest("POST", { password: "test-videos-password" })))
        .status,
    ).toBe(200);
  });

  it("preserves blocked logins across application restarts", async () => {
    const dataDirectory = await createTemporaryDirectory("videos-auth-test-");
    const first = await testApp({ maxAttempts: 2, dataDirectory });
    await first.context.auth.setupPassword("test-videos-password");
    await first.context.auth.setupAdminProfile("Admin", testAdminPassword);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(
        (
          await first.app.request(
            "/api/auth",
            jsonRequest("POST", { password: "wrong-videos-password" }),
          )
        ).status,
      ).toBe(401);
    }
    await closeContext(first.context);

    const second = await testApp({ maxAttempts: 2, dataDirectory });
    const blocked = await second.app.request(
      "/api/auth",
      jsonRequest("POST", { password: "test-videos-password" }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("preserves active sessions across application restarts", async () => {
    const dataDirectory = await createTemporaryDirectory("videos-session-test-");
    const first = await testApp({ dataDirectory });
    await first.context.auth.setupPassword("test-videos-password");
    await first.context.auth.setupAdminProfile("Admin", testAdminPassword);
    const login = await first.app.request(
      "/api/auth",
      jsonRequest("POST", { password: "test-videos-password" }),
    );
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const selectionKey = await selectTestAdmin(first.app, cookie!);
    await closeContext(first.context);

    const second = await testApp({ dataDirectory });

    expect(
      (
        await second.app.request("/api/library", {
          headers: { cookie: cookie!, "x-profile-selection": selectionKey },
        })
      ).status,
    ).toBe(200);
  });

  it("rejects unsigned or expired session cookies", async () => {
    const { app, context } = await testApp({ idleTimeoutMs: 1 });
    await context.auth.setupPassword("test-videos-password");
    await context.auth.setupAdminProfile("Admin", testAdminPassword);

    expect(
      (
        await app.request("/api/library", {
          headers: {
            cookie: `videos_session=${await context.auth.signIn("test-videos-password")}`,
          },
        })
      ).status,
    ).toBe(401);

    const login = await app.request(
      "/api/auth",
      jsonRequest("POST", { password: "test-videos-password" }),
    );
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await app.request("/api/library", { headers: { cookie: cookie! } })).status).toBe(401);
  });

  it("rejects cross-origin form posts", async () => {
    const { app } = await testApp();

    const response = await app.request("/api/auth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://attacker.jaw.dev",
      },
    });

    expect(response.status).toBe(403);
  });

  it("requires at least 15 Unicode characters for new passwords", async () => {
    const { app } = await testApp();
    const shortPassword = "😀".repeat(14);
    const validPassword = "😀".repeat(15);

    const shortResponse = await app.request(
      "/api/auth/password",
      jsonRequest("POST", {
        password: shortPassword,
        confirmPassword: shortPassword,
      }),
    );
    expect(shortResponse.status).toBe(400);
    expect(await shortResponse.json()).toEqual({
      message: "Password must be at least 15 characters",
    });
    expect(
      (
        await app.request(
          "/api/auth/password",
          jsonRequest("POST", {
            password: validPassword,
            confirmPassword: validPassword,
          }),
        )
      ).status,
    ).toBe(201);
  });

  it("treats short sign-in passwords as invalid credentials", async () => {
    const { app, context } = await testApp();
    const password = "short123";
    await context.database.connection("auth_credentials").insert({
      id: 1,
      password_hash: await bcrypt.hash(password, 4),
    });

    expect(await context.auth.isPasswordValid(password)).toBe(false);
    const response = await app.request("/api/auth", jsonRequest("POST", { password }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Invalid password" });
  });

  it("rejects oversized authentication requests before parsing them", async () => {
    const { app } = await testApp();
    const response = await app.request(
      "/api/auth",
      jsonRequest("POST", { password: "x".repeat(4 * 1024) }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "Authentication request is too large" });
  });

  it("rejects passwords that bcrypt would silently truncate", async () => {
    const { app } = await testApp();
    const password = "😀".repeat(18);
    expect(Buffer.byteLength(password, "utf8")).toBe(72);
    expect(
      (
        await app.request(
          "/api/auth/password",
          jsonRequest("POST", { password, confirmPassword: password }),
        )
      ).status,
    ).toBe(201);
    const overlongLogin = await app.request(
      "/api/auth",
      jsonRequest("POST", { password: `${password}a` }),
    );
    expect(overlongLogin.status).toBe(401);
    expect(await overlongLogin.json()).toEqual({ message: "Invalid password" });
    expect((await app.request("/api/auth", jsonRequest("POST", { password }))).status).toBe(200);
  });
});
