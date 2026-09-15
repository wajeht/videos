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
  const profiles = context.profiles;
  const requireProfile = createRequireProfile(context);
  return new Hono()
    .basePath("/profiles")
    .get("/", async (c) => c.json(await profiles.listProfiles()))
    .post(
      "/",
      requireProfile,
      requireAdmin,
      authBodyLimit,
      zValidator("json", createProfileSchema, validationHook),
      async (c) => {
        const input = c.req.valid("json");
        const profile = await profiles.createProfile(c.get("profile").id, input);
        return profile
          ? c.json(profile, 201)
          : c.json({ message: "An admin profile is required" }, 403);
      },
    )
    .post("/clear", requireProfile, async (c) => {
      await profiles.clearProfile(c.get("session").sessionKey);
      return c.json({ cleared: true });
    })
    .post(
      "/:profileId/select",
      authBodyLimit,
      zValidator("param", profileParametersSchema),
      zValidator("json", selectProfileSchema, validationHook),
      async (c) => {
        const result = await profiles.selectProfile(
          c.get("session").sessionKey,
          c.req.valid("param").profileId,
          c.req.valid("json").password,
          clientKey(c, context.configuration),
        );
        if (!result.ok) {
          if (result.reason === "rate_limited") {
            c.header("Retry-After", String(result.retryAfter));
            return c.json({ message: "Too many attempts. Try again later." }, 429);
          }
          if (result.reason === "not_found") return c.json({ message: "Profile not found" }, 404);
          if (result.reason === "incorrect_password")
            return c.json({ message: "Incorrect profile password" }, 403);
          return c.json({ message: "Profile changed. Try again." }, 409);
        }
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
        const result = await profiles.updateProfile(
          c.get("profile").id,
          c.req.valid("param").profileId,
          c.req.valid("json"),
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
        const result = await profiles.changePassword(
          c.get("profile").id,
          c.req.valid("param").profileId,
          password,
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
        const result = await profiles.deleteProfile(
          c.get("profile").id,
          c.req.valid("param").profileId,
        );
        if (result !== "ok") {
          const error = mutationError(result);
          return c.json({ message: error.message }, error.status);
        }
        return c.json({ deleted: true });
      },
    );
}
