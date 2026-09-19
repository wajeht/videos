import { profileDto } from "../profiles/profiles.repository.js";
import { profilePasswordSchema, type ProfileDto } from "../profiles/profiles.schema.js";
import type { SessionPayload } from "./auth.service.js";
import { clientKey } from "./client-identity.js";

import { zValidator } from "@hono/zod-validator";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";

import type { Configuration } from "../config.js";
import type { AppContext } from "../context.js";
import { MIN_PASSWORD_LENGTH } from "./auth.service.js";

export const authBodyLimit = bodyLimit({
  maxSize: 4 * 1024,
  onError: (c) => c.json({ message: "Authentication request is too large" }, 413),
});
const passwordSchema = z
  .string()
  .max(72)
  .refine(
    (password) => [...password].length >= MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  )
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, "Password is too long");
const loginSchema = z.object({ password: z.string() }).strict();
const setupSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
    setupToken: z.string().min(16).max(256).optional(),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
const adminSetupSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    password: profilePasswordSchema,
  })
  .strict();
const changePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export function validationHook(
  result: { success: boolean; error?: { issues: readonly { message: string }[] } },
  c: Context,
): Response | undefined {
  if (!result.success) {
    return c.json({ message: result.error?.issues[0]?.message ?? "Invalid request" }, 400);
  }
}

function sessionCookieName(configuration: Configuration): string {
  return configuration.app.env === "production" ? "__Host-videos_session" : "videos_session";
}

function sessionCookieOptions(configuration: Configuration) {
  return {
    httpOnly: true,
    secure: configuration.app.env === "production",
    sameSite: "Strict" as const,
    path: "/",
    maxAge: Math.floor(configuration.auth.absoluteTimeoutMs / 1000),
  };
}

async function readSession(c: Context, context: AppContext) {
  const cookie = await getSignedCookie(
    c,
    context.configuration.auth.sessionSecret,
    sessionCookieName(context.configuration),
  );
  return cookie ? context.auth.parseSession(cookie) : null;
}

async function writeSession(c: Context, context: AppContext, value: string): Promise<void> {
  await setSignedCookie(
    c,
    sessionCookieName(context.configuration),
    value,
    context.configuration.auth.sessionSecret,
    sessionCookieOptions(context.configuration),
  );
}

export function createRequireAuth(context: AppContext): MiddlewareHandler {
  return async (c, next) => {
    const session = await readSession(c, context);
    if (!session) return c.json({ message: "Authentication required" }, 401);
    c.set("session", session);
    await context.auth.touchSession(session);
    await next();
  };
}

declare module "hono" {
  interface ContextVariableMap {
    session: SessionPayload;
    profile: ProfileDto;
  }
}

export function createRequireProfile(context: AppContext): MiddlewareHandler {
  return async (c, next) => {
    const session = c.get("session");
    if (
      !session.profileId ||
      !session.profileSelectionKey ||
      c.req.header("x-profile-selection") !== session.profileSelectionKey
    ) {
      return c.json({ message: "Choose your profile again", code: "PROFILE_CHANGED" }, 409);
    }
    const profile = await context.profilesRepository.findProfile(session.profileId);
    if (!profile)
      return c.json({ message: "Choose your profile again", code: "PROFILE_CHANGED" }, 409);
    c.set("profile", profileDto(profile));
    await next();
  };
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  if (c.get("profile").role !== "admin")
    return c.json({ message: "An admin profile is required" }, 403);
  await next();
};

export function createAuthRouter(context: AppContext) {
  const configuration = context.configuration;

  return new Hono()
    .basePath("/auth")
    .get("/me", async (c) => {
      const session = await readSession(c, context);
      const profile = session?.profileId
        ? await context.profilesRepository.findProfile(session.profileId)
        : undefined;
      const authenticated = Boolean(session);
      const passwordConfigured = await context.auth.isPasswordConfigured();
      return c.json({
        authenticated,
        profile: profile ? profileDto(profile) : null,
        profileSelectionKey: profile ? session!.profileSelectionKey : null,
        passwordConfigured,
        adminProfileRequired: authenticated && !(await context.auth.isAdminConfigured()),
        setupEnabled:
          !passwordConfigured &&
          (configuration.app.env !== "production" || Boolean(configuration.auth.setupToken)),
        setupTokenRequired: !passwordConfigured && configuration.app.env === "production",
      });
    })
    .post("/", authBodyLimit, zValidator("json", loginSchema, validationHook), async (c) => {
      const key = clientKey(c, configuration);
      if (!(await context.auth.isPasswordConfigured())) {
        return c.json({ message: "Library password is not configured" }, 409);
      }
      const attempt = await context.auth.reserveLoginAttempt(key);
      if (!attempt.allowed) {
        const retryAfter = Math.max(1, Math.ceil((attempt.resetAt - Date.now()) / 1000));
        c.header("Retry-After", String(retryAfter));
        return c.json({ message: "Too many login attempts. Try again later." }, 429);
      }
      if (!(await context.auth.isPasswordValid(c.req.valid("json").password))) {
        context.logger.warn("Failed login attempt", { client: key });
        return c.json({ message: "Invalid password" }, 401);
      }
      await context.auth.clearLoginFailures(key);
      await writeSession(c, context, await context.auth.createSession());
      context.logger.info("Login successful", { client: key });
      return c.json({ authenticated: true });
    })
    .post("/logout", async (c) => {
      const cookie = await getSignedCookie(
        c,
        configuration.auth.sessionSecret,
        sessionCookieName(configuration),
      );
      if (cookie) await context.auth.revokeSession(cookie);
      deleteCookie(c, sessionCookieName(configuration), sessionCookieOptions(configuration));
      return c.json({ authenticated: false });
    })
    .post(
      "/password",
      authBodyLimit,
      zValidator("json", setupSchema, validationHook),
      async (c) => {
        const { password, setupToken } = c.req.valid("json");
        const result = await context.auth.setupPassword(password, setupToken);
        if (result.ok) {
          context.logger.info("Initial application password configured");
          return c.json({ passwordConfigured: true }, 201);
        }
        if (result.reason === "already_configured") {
          return c.json({ message: "Library password is already configured" }, 409);
        }
        if (result.reason === "setup_disabled") {
          return c.json({ message: "Password setup is unavailable" }, 503);
        }
        return c.json({ message: "The password or setup token is incorrect" }, 400);
      },
    )
    .post(
      "/admin-profile",
      createRequireAuth(context),
      authBodyLimit,
      zValidator("json", adminSetupSchema, validationHook),
      async (c) => {
        const { name, password } = c.req.valid("json");
        const result = await context.auth.setupAdminProfile(name, password);
        if (result.ok) return c.json({ adminConfigured: true }, 201);
        if (result.reason === "already_configured")
          return c.json({ message: "Admin profile is already configured" }, 409);
        return c.json({ message: "Could not create the admin profile" }, 400);
      },
    )
    .put(
      "/password",
      createRequireAuth(context),
      createRequireProfile(context),
      requireAdmin,
      authBodyLimit,
      zValidator("json", changePasswordSchema, validationHook),
      async (c) => {
        const { currentPassword, newPassword } = c.req.valid("json");
        const result = await context.auth.changePassword(currentPassword, newPassword);
        if (!result.ok) return c.json({ message: "Current password is incorrect" }, 400);
        await writeSession(c, context, await context.auth.createSession());
        context.logger.info("Application password changed");
        return c.json({ passwordChanged: true });
      },
    );
}
