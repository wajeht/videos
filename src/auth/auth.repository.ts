import { insertProfile } from "../profiles/profiles.repository.js";
import type { Knex } from "knex";

const credentialsId = 1;

export type AttemptReservation = { allowed: true } | { allowed: false; resetAt: number };

export interface StoredSession {
  activeAt: number;
  createdAt: number;
  sessionKey: string;
  profileId: string | null;
  profileSelectionKey: string | null;
}

export interface AuthRepository {
  getPasswordHash(): Promise<string | null>;
  setupCredentials(passwordHash: string): Promise<boolean>;
  isAdminConfigured(): Promise<boolean>;
  setupAdminProfile(name: string, passwordHash: string): Promise<boolean>;
  changePasswordHash(
    expectedHash: string,
    passwordHash: string,
    session: StoredSession,
  ): Promise<boolean>;
  reserveLoginAttempt(
    clientKey: string,
    now: number,
    windowMs: number,
    maxAttempts: number,
  ): Promise<AttemptReservation>;
  clearLoginFailures(clientKey: string): Promise<void>;
  createSession(session: StoredSession, passwordHash: string): Promise<boolean>;
  getSession(sessionKey: string): Promise<StoredSession | null>;
  updateSessionActivity(sessionKey: string, activeAt: number): Promise<void>;
  deleteSession(sessionKey: string): Promise<void>;
  deleteExpiredSessions(idleCutoff: number, absoluteCutoff: number): Promise<void>;
}

async function insertSession(database: Knex, session: StoredSession): Promise<void> {
  await database("auth_sessions").insert({
    session_key: session.sessionKey,
    created_at: session.createdAt,
    active_at: session.activeAt,
    profile_id: session.profileId,
    profile_selection_key: session.profileSelectionKey,
  });
}

export function createAuthRepository(database: Knex): AuthRepository {
  return {
    async getPasswordHash(): Promise<string | null> {
      const credentials = await database("auth_credentials")
        .where({ id: credentialsId })
        .first<{ password_hash: string }>();
      return credentials?.password_hash ?? null;
    },

    async setupCredentials(passwordHash) {
      return database.transaction(async (transaction) => {
        if (await transaction("auth_credentials").first()) return false;
        await transaction("auth_credentials").insert({
          id: credentialsId,
          password_hash: passwordHash,
        });
        return true;
      });
    },

    async isAdminConfigured() {
      return Boolean(await database("profiles").where({ role: "admin" }).first());
    },

    async setupAdminProfile(name, passwordHash) {
      return database.transaction(async (transaction) => {
        if (await transaction("profiles").first()) return false;
        await insertProfile(transaction, { name, role: "admin" }, passwordHash);
        return true;
      });
    },

    async changePasswordHash(expectedHash, passwordHash, session) {
      return database.transaction(async (transaction) => {
        const updated = await transaction("auth_credentials")
          .where({ id: credentialsId, password_hash: expectedHash })
          .update({ password_hash: passwordHash });
        if (updated !== 1) return false;
        await transaction("auth_sessions").delete();
        await insertSession(transaction, session);
        return true;
      });
    },

    async reserveLoginAttempt(clientKey, now, windowMs, maxAttempts) {
      return database.transaction(async (transaction) => {
        await transaction("auth_login_attempts").where("reset_at", "<=", now).delete();
        const current = await transaction("auth_login_attempts")
          .where({ client_key: clientKey })
          .first<{ failures: number; reset_at: number }>();
        const resetAt = current ? Number(current.reset_at) : now + windowMs;
        if (current && current.failures >= maxAttempts) return { allowed: false, resetAt };

        await transaction("auth_login_attempts")
          .insert({
            client_key: clientKey,
            failures: (current?.failures ?? 0) + 1,
            reset_at: resetAt,
          })
          .onConflict("client_key")
          .merge();
        return { allowed: true };
      });
    },

    async clearLoginFailures(clientKey: string): Promise<void> {
      await database("auth_login_attempts").where({ client_key: clientKey }).delete();
    },

    async createSession(session, passwordHash) {
      return database.transaction(async (transaction) => {
        const credentials = await transaction("auth_credentials")
          .where({ id: credentialsId, password_hash: passwordHash })
          .first();
        if (!credentials) return false;
        await insertSession(transaction, session);
        return true;
      });
    },

    async getSession(sessionKey: string): Promise<StoredSession | null> {
      const session = await database("auth_sessions").where({ session_key: sessionKey }).first<{
        active_at: number;
        created_at: number;
        session_key: string;
        profile_id: string | null;
        profile_selection_key: string | null;
      }>();
      return session
        ? {
            activeAt: Number(session.active_at),
            createdAt: Number(session.created_at),
            sessionKey: session.session_key,
            profileId: session.profile_id,
            profileSelectionKey: session.profile_selection_key,
          }
        : null;
    },

    async updateSessionActivity(sessionKey: string, activeAt: number): Promise<void> {
      await database("auth_sessions")
        .where({ session_key: sessionKey })
        .andWhere("active_at", "<", activeAt)
        .update({ active_at: activeAt });
    },

    async deleteSession(sessionKey: string): Promise<void> {
      await database("auth_sessions").where({ session_key: sessionKey }).delete();
    },

    async deleteExpiredSessions(idleCutoff: number, absoluteCutoff: number): Promise<void> {
      await database("auth_sessions")
        .where("active_at", "<", idleCutoff)
        .orWhere("created_at", "<", absoluteCutoff)
        .delete();
    },
  };
}
