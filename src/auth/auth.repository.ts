import { insertProfile } from "../profiles/profiles.repository.js";
import type { Knex } from "knex";

const credentialsId = 1;

export interface LoginAttempt {
  failures: number;
  resetAt: number;
}

export interface StoredSession {
  activeAt: number;
  createdAt: number;
  sessionKey: string;
  profileId: string | null;
  profileSelectionKey: string | null;
}

export interface AuthRepository {
  getPasswordHash(): Promise<string | null>;
  setupCredentials(passwordHash: string, adminName: string, adminPinHash: string): Promise<boolean>;
  changePasswordHash(passwordHash: string): Promise<void>;
  getLoginAttempt(clientKey: string, now: number): Promise<LoginAttempt | null>;
  recordLoginFailure(clientKey: string, now: number, windowMs: number): Promise<void>;
  clearLoginFailures(clientKey: string): Promise<void>;
  createSession(session: StoredSession): Promise<void>;
  getSession(sessionKey: string): Promise<StoredSession | null>;
  updateSessionActivity(sessionKey: string, activeAt: number): Promise<void>;
  deleteSession(sessionKey: string): Promise<void>;
  deleteExpiredSessions(idleCutoff: number, absoluteCutoff: number): Promise<void>;
}

export function createAuthRepository(database: Knex): AuthRepository {
  return {
    async getPasswordHash(): Promise<string | null> {
      const credentials = await database("auth_credentials")
        .where({ id: credentialsId })
        .first<{ password_hash: string }>();
      return credentials?.password_hash ?? null;
    },

    async setupCredentials(passwordHash, adminName, adminPinHash) {
      return database.transaction(async (transaction) => {
        if (await transaction("auth_credentials").first()) return false;
        await transaction("auth_credentials").insert({
          id: credentialsId,
          password_hash: passwordHash,
        });
        await insertProfile(
          transaction,
          { name: adminName, avatarKey: "pine", role: "admin" },
          adminPinHash,
        );
        return true;
      });
    },

    async changePasswordHash(passwordHash: string): Promise<void> {
      await database.transaction(async (transaction) => {
        await transaction("auth_credentials")
          .insert({ id: credentialsId, password_hash: passwordHash })
          .onConflict("id")
          .merge({ password_hash: passwordHash });
        await transaction("auth_sessions").delete();
      });
    },

    async getLoginAttempt(clientKey: string, now: number): Promise<LoginAttempt | null> {
      const attempt = await database("auth_login_attempts")
        .where({ client_key: clientKey })
        .first<{ failures: number; reset_at: number }>();
      if (!attempt) return null;

      const resetAt = Number(attempt.reset_at);
      if (resetAt <= now) {
        await database("auth_login_attempts")
          .where({ client_key: clientKey })
          .andWhere("reset_at", "<=", now)
          .delete();
        return null;
      }

      return { failures: attempt.failures, resetAt };
    },

    async recordLoginFailure(clientKey: string, now: number, windowMs: number): Promise<void> {
      await database.transaction(async (transaction) => {
        await transaction("auth_login_attempts").where("reset_at", "<=", now).delete();
        const current = await transaction("auth_login_attempts")
          .where({ client_key: clientKey })
          .first<{ failures: number; reset_at: number }>();
        const resetAt = current ? Number(current.reset_at) : now + windowMs;

        await transaction("auth_login_attempts")
          .insert({
            client_key: clientKey,
            failures: (current?.failures ?? 0) + 1,
            reset_at: resetAt,
          })
          .onConflict("client_key")
          .merge();
      });
    },

    async clearLoginFailures(clientKey: string): Promise<void> {
      await database("auth_login_attempts").where({ client_key: clientKey }).delete();
    },

    async createSession(session: StoredSession): Promise<void> {
      await database("auth_sessions").insert({
        session_key: session.sessionKey,
        created_at: session.createdAt,
        active_at: session.activeAt,
        profile_id: session.profileId,
        profile_selection_key: session.profileSelectionKey,
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
