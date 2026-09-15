import crypto from "node:crypto";
import type { Knex } from "knex";
import type { ProfileDto, UpdateProfileInput } from "./profiles.schema.js";

export interface ProfileRow {
  id: string;
  name: string;
  role: ProfileDto["role"];
  password_hash: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
export function profileDto(row: ProfileRow): ProfileDto {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    isLocked: row.password_hash !== null,
  };
}
export type ProfileMutationResult =
  | "ok"
  | "forbidden"
  | "not_found"
  | "last_admin"
  | "password_required";
export type ProfileMutation =
  | { kind: "details"; input: UpdateProfileInput }
  | { kind: "password"; passwordHash: string | null }
  | { kind: "delete" };

function mutationPermission(
  actor: ProfileRow,
  target: ProfileRow,
  mutation: ProfileMutation,
): ProfileMutationResult {
  if (actor.role !== "admin") {
    if (actor.id !== target.id || mutation.kind === "delete") return "forbidden";
    if (mutation.kind === "details" && mutation.input.role !== target.role) return "forbidden";
  }
  if (mutation.kind === "details" && mutation.input.role === "admin" && !target.password_hash)
    return "password_required";
  if (mutation.kind === "password" && target.role === "admin" && !mutation.passwordHash)
    return "password_required";
  return "ok";
}

export async function insertProfile(
  database: Knex,
  input: UpdateProfileInput,
  passwordHash: string | null,
): Promise<ProfileDto> {
  const now = new Date().toISOString();
  const last = await database<ProfileRow>("profiles")
    .max<{ order: number | null }>("sort_order as order")
    .first();
  const row: ProfileRow = {
    id: crypto.randomUUID(),
    name: input.name,
    role: input.role,
    password_hash: passwordHash,
    sort_order: (last?.order ?? -1) + 1,
    created_at: now,
    updated_at: now,
  };
  await database("profiles").insert(row);
  await database("profile_settings").insert({
    profile_id: row.id,
    key: "library_page_size",
    value: "24",
    updated_at: now,
  });
  return profileDto(row);
}

export function createProfilesRepository(database: Knex) {
  return {
    async listProfiles(): Promise<ProfileDto[]> {
      return (await database<ProfileRow>("profiles").orderBy("sort_order").orderBy("id")).map(
        profileDto,
      );
    },
    async findProfile(id: string): Promise<ProfileRow | undefined> {
      return database<ProfileRow>("profiles").where({ id }).first();
    },
    async createProfile(
      actorId: string,
      input: UpdateProfileInput,
      passwordHash: string | null,
    ): Promise<ProfileDto | null> {
      return database.transaction(async (transaction) => {
        const actor = await transaction<ProfileRow>("profiles")
          .where({ id: actorId, role: "admin" })
          .first();
        if (!actor) return null;
        return insertProfile(transaction, input, passwordHash);
      });
    },
    async mutateProfile(
      actorId: string,
      id: string,
      mutation: ProfileMutation,
    ): Promise<ProfileMutationResult> {
      return database.transaction(async (transaction) => {
        const actor = await transaction<ProfileRow>("profiles").where({ id: actorId }).first();
        const target = await transaction<ProfileRow>("profiles").where({ id }).first();
        if (!actor) return "forbidden";
        if (!target) return "not_found";
        const permission = mutationPermission(actor, target, mutation);
        if (permission !== "ok") return permission;
        if (
          target.role === "admin" &&
          (mutation.kind === "delete" ||
            (mutation.kind === "details" && mutation.input.role !== "admin"))
        ) {
          const others = await transaction("profiles")
            .where({ role: "admin" })
            .whereNot({ id })
            .first();
          if (!others) return "last_admin";
        }
        if (mutation.kind === "delete") {
          await transaction("profiles").where({ id }).delete();
          return "ok";
        }
        if (mutation.kind === "password" || mutation.input.role !== target.role) {
          await transaction("auth_sessions")
            .where({ profile_id: id })
            .update({ profile_id: null, profile_selection_key: null });
        }
        const changes =
          mutation.kind === "password"
            ? { password_hash: mutation.passwordHash }
            : {
                name: mutation.input.name,
                role: mutation.input.role,
              };
        await transaction("profiles")
          .where({ id })
          .update({ ...changes, updated_at: new Date().toISOString() });
        return "ok";
      });
    },
    async selectProfile(sessionKey: string, profile: ProfileRow): Promise<boolean> {
      return database.transaction(async (transaction) => {
        // Recheck the lock after password verification in case another session changed it.
        const current = await transaction<ProfileRow>("profiles").where({ id: profile.id }).first();
        if (!current || current.password_hash !== profile.password_hash) return false;
        const updated = await transaction("auth_sessions")
          .where({ session_key: sessionKey })
          .update({
            profile_id: profile.id,
            profile_selection_key: crypto.randomBytes(24).toString("hex"),
          });
        return updated === 1;
      });
    },
    async clearProfile(sessionKey: string): Promise<void> {
      await database("auth_sessions")
        .where({ session_key: sessionKey })
        .update({ profile_id: null, profile_selection_key: null });
    },
    async getUnlockAttempt(
      profileId: string,
      clientKey: string,
      now: number,
    ): Promise<{ failures: number; reset_at: number } | undefined> {
      return database("profile_unlock_attempts")
        .where({ profile_id: profileId, client_key: clientKey })
        .where("reset_at", ">", now)
        .first();
    },
    async recordUnlockFailure(
      profileId: string,
      clientKey: string,
      now: number,
      windowMs: number,
    ): Promise<void> {
      await database.transaction(async (transaction) => {
        await transaction("profile_unlock_attempts").where("reset_at", "<=", now).delete();
        await transaction("profile_unlock_attempts")
          .insert({
            profile_id: profileId,
            client_key: clientKey,
            failures: 1,
            reset_at: now + windowMs,
          })
          .onConflict(["profile_id", "client_key"])
          .merge({ failures: transaction.raw("failures + 1") });
      });
    },
    async clearUnlockFailures(profileId: string, clientKey: string): Promise<void> {
      await database("profile_unlock_attempts")
        .where({ profile_id: profileId, client_key: clientKey })
        .delete();
    },
  };
}
export type ProfilesRepository = ReturnType<typeof createProfilesRepository>;
