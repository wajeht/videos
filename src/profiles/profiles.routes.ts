import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppContext } from "../context.js";
import {
  authBodyLimit,
  clientKey,
  createRequireProfile,
  requireAdmin,
  validationHook,
} from "../auth/auth.routes.js";
import {
  createProfileSchema,
  profileParametersSchema,
  profilePasswordChangeSchema,
  selectProfileSchema,
  updateProfileSchema,
} from "./profiles.schema.js";
import type { ProfileMutationResult } from "./profiles.repository.js";

const mutationErrors = {
  forbidden: { message: "You cannot change this profile", status: 403 },
  not_found: { message: "Profile not found", status: 404 },
  admin_required: { message: "The admin profile cannot be deleted", status: 409 },
  password_required: { message: "Admin profiles require a password", status: 400 },
} as const;
function mutationError(result: Exclude<ProfileMutationResult, "ok">) {
  return mutationErrors[result];
}

export function createProfilesRouter(context: AppContext) {
  const repository = context.profiles;
  const requireProfile = createRequireProfile(context);
  const rounds = context.configuration.app.env === "testing" ? 4 : 12;
  return new Hono()
    .basePath("/profiles")
    .get("/", async (c) => c.json(await repository.listProfiles()))
    .post(
      "/",
      requireProfile,
      requireAdmin,
      authBodyLimit,
      zValidator("json", createProfileSchema, validationHook),
      async (c) => {
        const input = c.req.valid("json");
        const profile = await repository.createProfile(
          c.get("profile").id,
          input,
          input.password === null ? null : await bcrypt.hash(input.password, rounds),
        );
        return profile
          ? c.json(profile, 201)
          : c.json({ message: "An admin profile is required" }, 403);
      },
    )
    .post("/clear", requireProfile, async (c) => {
      await repository.clearProfile(c.get("session").sessionKey);
      return c.json({ cleared: true });
    })
    .post(
      "/:profileId/select",
      authBodyLimit,
      zValidator("param", profileParametersSchema),
      zValidator("json", selectProfileSchema, validationHook),
      async (c) => {
        const profileId = c.req.valid("param").profileId;
        const profile = await repository.findProfile(profileId);
        if (!profile) return c.json({ message: "Profile not found" }, 404);
        const key = clientKey(c, context.configuration);
        const now = Date.now();
        const attempt = await repository.getUnlockAttempt(profileId, key, now);
        if (attempt && attempt.failures >= context.configuration.auth.loginMaxAttempts) {
          c.header("Retry-After", String(Math.max(1, Math.ceil((attempt.reset_at - now) / 1000))));
          return c.json({ message: "Too many attempts. Try again later." }, 429);
        }
        if (
          profile.password_hash &&
          !(await bcrypt.compare(c.req.valid("json").password, profile.password_hash))
        ) {
          await repository.recordUnlockFailure(
            profileId,
            key,
            now,
            context.configuration.auth.loginWindowMs,
          );
          return c.json({ message: "Incorrect profile password" }, 403);
        }
        if (!(await repository.selectProfile(c.get("session").sessionKey, profile)))
          return c.json({ message: "Profile changed. Try again." }, 409);
        await repository.clearUnlockFailures(profileId, key);
        return c.json({ selected: true });
      },
    )
    .put(
      "/:profileId",
      requireProfile,
      authBodyLimit,
      zValidator("param", profileParametersSchema),
      zValidator("json", updateProfileSchema, validationHook),
      async (c) => {
        const result = await repository.mutateProfile(
          c.get("profile").id,
          c.req.valid("param").profileId,
          { kind: "details", input: c.req.valid("json") },
        );
        if (result !== "ok") {
          const error = mutationError(result);
          return c.json({ message: error.message }, error.status);
        }
        return c.json({ saved: true });
      },
    )
    .put(
      "/:profileId/password",
      requireProfile,
      authBodyLimit,
      zValidator("param", profileParametersSchema),
      zValidator("json", profilePasswordChangeSchema, validationHook),
      async (c) => {
        const password = c.req.valid("json").password;
        const result = await repository.mutateProfile(
          c.get("profile").id,
          c.req.valid("param").profileId,
          {
            kind: "password",
            passwordHash: password === null ? null : await bcrypt.hash(password, rounds),
          },
        );
        if (result !== "ok") {
          const error = mutationError(result);
          return c.json({ message: error.message }, error.status);
        }
        return c.json({ saved: true });
      },
    )
    .delete(
      "/:profileId",
      requireProfile,
      zValidator("param", profileParametersSchema),
      async (c) => {
        const result = await repository.mutateProfile(
          c.get("profile").id,
          c.req.valid("param").profileId,
          { kind: "delete" },
        );
        if (result !== "ok") {
          const error = mutationError(result);
          return c.json({ message: error.message }, error.status);
        }
        return c.json({ deleted: true });
      },
    );
}
