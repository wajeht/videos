import bcrypt from "bcryptjs";

import type { Configuration } from "../config.js";
import type { ProfilesRepository } from "./profiles.repository.js";
import type { CreateProfileInput, UpdateProfileInput } from "./profiles.schema.js";

type SelectProfileResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "incorrect_password" | "changed" }
  | { ok: false; reason: "rate_limited"; retryAfter: number };

export function createProfilesService(
  repository: ProfilesRepository,
  configuration: Configuration,
) {
  const rounds = configuration.app.env === "testing" ? 4 : 12;

  return {
    listProfiles: () => repository.listProfiles(),
    clearProfile: (sessionKey: string) => repository.clearProfile(sessionKey),

    async createProfile(actorId: string, input: CreateProfileInput) {
      const hash = input.password === null ? null : await bcrypt.hash(input.password, rounds);
      return repository.createProfile(actorId, input, hash);
    },

    updateProfile(actorId: string, profileId: string, input: UpdateProfileInput) {
      return repository.mutateProfile(actorId, profileId, { kind: "details", input });
    },

    async changePassword(actorId: string, profileId: string, password: string | null) {
      const passwordHash = password === null ? null : await bcrypt.hash(password, rounds);
      return repository.mutateProfile(actorId, profileId, { kind: "password", passwordHash });
    },

    deleteProfile(actorId: string, profileId: string) {
      return repository.mutateProfile(actorId, profileId, { kind: "delete" });
    },

    async selectProfile(
      sessionKey: string,
      profileId: string,
      password: string,
      clientKey: string,
    ): Promise<SelectProfileResult> {
      const profile = await repository.findProfile(profileId);
      if (!profile) return { ok: false, reason: "not_found" };
      const now = Date.now();
      const attempt = await repository.getUnlockAttempt(profileId, clientKey, now);
      if (attempt && attempt.failures >= configuration.auth.loginMaxAttempts) {
        return {
          ok: false,
          reason: "rate_limited",
          retryAfter: Math.max(1, Math.ceil((attempt.reset_at - now) / 1000)),
        };
      }
      if (profile.password_hash && !(await bcrypt.compare(password, profile.password_hash))) {
        await repository.recordUnlockFailure(
          profileId,
          clientKey,
          now,
          configuration.auth.loginWindowMs,
        );
        return { ok: false, reason: "incorrect_password" };
      }
      if (!(await repository.selectProfile(sessionKey, profile)))
        return { ok: false, reason: "changed" };
      await repository.clearUnlockFailures(profileId, clientKey);
      return { ok: true };
    },
  };
}

export type ProfilesService = ReturnType<typeof createProfilesService>;
