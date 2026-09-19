import { profilePasswordSchema } from "../profiles/profiles.schema.js";
import crypto from "node:crypto";

import bcrypt from "bcryptjs";

import type { Configuration } from "../config.js";
import type { AttemptReservation, AuthRepository } from "./auth.repository.js";

export const MIN_PASSWORD_LENGTH = 15;

export interface SessionPayload {
  profileId: string | null;
  profileSelectionKey: string | null;
  sessionKey: string;
  token: string;
  createdAt: number;
  activeAt: number;
}

export type PasswordResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "not_configured" | "already_configured" | "setup_disabled" };
export type PasswordChangeResult =
  | { ok: true; session: string }
  | { ok: false; reason: "invalid" | "not_configured" };

export interface AuthService {
  isPasswordConfigured(): Promise<boolean>;
  isPasswordValid(password: string): Promise<boolean>;
  signIn(password: string): Promise<string | null>;
  setupPassword(password: string, setupToken?: string): Promise<PasswordResult>;
  isAdminConfigured(): Promise<boolean>;
  setupAdminProfile(name: string, password: string): Promise<PasswordResult>;
  changePassword(currentPassword: string, newPassword: string): Promise<PasswordChangeResult>;
  reserveLoginAttempt(clientKey: string, now?: number): Promise<AttemptReservation>;
  clearLoginFailures(clientKey: string): Promise<void>;
  touchSession(payload: SessionPayload, now?: number): Promise<void>;
  parseSession(value: string, now?: number): Promise<SessionPayload | null>;
  revokeSession(value: string): Promise<void>;
}

function hasValidPasswordLength(password: string): boolean {
  return [...password].length >= MIN_PASSWORD_LENGTH && Buffer.byteLength(password, "utf8") <= 72;
}

function isSecurelyEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash("sha256").update(left).digest();
  const rightHash = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function sessionKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function newSession(now: number) {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    session: {
      activeAt: now,
      createdAt: now,
      sessionKey: sessionKey(token),
      profileId: null,
      profileSelectionKey: null,
    },
  };
}

export function createAuthService(
  repository: AuthRepository,
  configuration: Configuration,
): AuthService {
  return {
    async isPasswordConfigured(): Promise<boolean> {
      return Boolean(await repository.getPasswordHash());
    },

    async isPasswordValid(password: string): Promise<boolean> {
      const hash = await repository.getPasswordHash();
      return Boolean(hash) && hasValidPasswordLength(password) && bcrypt.compare(password, hash!);
    },

    async signIn(password) {
      const hash = await repository.getPasswordHash();
      if (!hash || !hasValidPasswordLength(password) || !(await bcrypt.compare(password, hash))) {
        return null;
      }
      const now = Date.now();
      await repository.deleteExpiredSessions(
        now - configuration.auth.idleTimeoutMs,
        now - configuration.auth.absoluteTimeoutMs,
      );
      const { token, session } = newSession(now);
      return (await repository.createSession(session, hash)) ? token : null;
    },

    async setupPassword(password: string, setupToken?: string): Promise<PasswordResult> {
      if (await repository.getPasswordHash()) return { ok: false, reason: "already_configured" };
      if (!hasValidPasswordLength(password)) return { ok: false, reason: "invalid" };
      if (configuration.app.env === "production") {
        if (!configuration.auth.setupToken) return { ok: false, reason: "setup_disabled" };
        if (!setupToken || !isSecurelyEqual(setupToken, configuration.auth.setupToken)) {
          return { ok: false, reason: "invalid" };
        }
      }
      const created = await repository.setupCredentials(
        await bcrypt.hash(password, configuration.app.env === "testing" ? 4 : 12),
      );
      return created ? { ok: true } : { ok: false, reason: "already_configured" };
    },

    isAdminConfigured: () => repository.isAdminConfigured(),

    async setupAdminProfile(name: string, password: string): Promise<PasswordResult> {
      if (!(await repository.getPasswordHash())) return { ok: false, reason: "not_configured" };
      if (
        !name.trim() ||
        name.trim().length > 40 ||
        !profilePasswordSchema.safeParse(password).success
      )
        return { ok: false, reason: "invalid" };
      const created = await repository.setupAdminProfile(
        name.trim(),
        await bcrypt.hash(password, configuration.app.env === "testing" ? 4 : 12),
      );
      return created ? { ok: true } : { ok: false, reason: "already_configured" };
    },

    async changePassword(currentPassword, newPassword) {
      const hash = await repository.getPasswordHash();
      if (!hash) return { ok: false, reason: "not_configured" };
      if (
        !hasValidPasswordLength(currentPassword) ||
        !hasValidPasswordLength(newPassword) ||
        !(await bcrypt.compare(currentPassword, hash))
      ) {
        return { ok: false, reason: "invalid" };
      }
      const passwordHash = await bcrypt.hash(
        newPassword,
        configuration.app.env === "testing" ? 4 : 12,
      );
      const { token, session } = newSession(Date.now());
      const changed = await repository.changePasswordHash(hash, passwordHash, session);
      return changed ? { ok: true, session: token } : { ok: false, reason: "invalid" };
    },

    reserveLoginAttempt(clientKey, now = Date.now()) {
      return repository.reserveLoginAttempt(
        clientKey,
        now,
        configuration.auth.loginWindowMs,
        configuration.auth.loginMaxAttempts,
      );
    },

    clearLoginFailures(clientKey: string): Promise<void> {
      return repository.clearLoginFailures(clientKey);
    },

    async touchSession(payload: SessionPayload, now = Date.now()): Promise<void> {
      const touchInterval = Math.max(
        1,
        Math.min(60_000, Math.floor(configuration.auth.idleTimeoutMs / 2)),
      );
      const activeAt = now - (now % touchInterval);
      if (payload.activeAt < activeAt) {
        await repository.updateSessionActivity(payload.sessionKey, activeAt);
      }
    },

    async parseSession(value: string, now = Date.now()): Promise<SessionPayload | null> {
      if (!/^[a-f0-9]{64}$/i.test(value)) return null;
      const key = sessionKey(value);
      const session = await repository.getSession(key);
      if (!session) return null;
      const invalid =
        session.createdAt > now ||
        session.activeAt < session.createdAt ||
        session.activeAt > now ||
        now - session.createdAt > configuration.auth.absoluteTimeoutMs ||
        now - session.activeAt > configuration.auth.idleTimeoutMs;
      if (invalid) {
        await repository.deleteSession(key);
        return null;
      }
      return { ...session, token: value };
    },

    async revokeSession(value: string): Promise<void> {
      if (!/^[a-f0-9]{64}$/i.test(value)) return;
      await repository.deleteSession(sessionKey(value));
    },
  };
}
