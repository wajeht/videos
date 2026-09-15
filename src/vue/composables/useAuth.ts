import { inject, reactive, readonly, type InjectionKey } from "vue";

import { api, setProfileSession, type AuthStateDto, type ProfileDto } from "@/api.js";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthControllerState {
  profile: ProfileDto | null;
  profileSelectionKey: string | null;
  error: string;
  passwordConfigured: boolean;
  setupEnabled: boolean;
  setupTokenRequired: boolean;
  status: AuthStatus;
}

interface AuthClient {
  selectProfile(profileId: string, password: string): Promise<void>;
  clearProfile(): Promise<void>;
  changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<void>;
  getAuthState(signal?: AbortSignal): Promise<AuthStateDto>;
  login(password: string): Promise<void>;
  logout(): Promise<void>;
  setupPassword(
    password: string,
    confirmPassword: string,
    adminName: string,
    adminPassword: string,
    setupToken?: string,
  ): Promise<void>;
}

interface CreateAuthOptions {
  checkTimeoutMilliseconds?: number;
  client?: AuthClient;
  onSessionChange?: () => void;
}

export interface AuthController {
  changePassword: AuthClient["changePassword"];
  selectProfile: AuthClient["selectProfile"];
  clearProfile: AuthClient["clearProfile"];
  dispose(): void;
  initialize(): Promise<void>;
  login(password: string): Promise<void>;
  logout(): Promise<void>;
  setupPassword(
    password: string,
    confirmPassword: string,
    adminName: string,
    adminPassword: string,
    setupToken?: string,
  ): Promise<void>;
  state: Readonly<AuthControllerState>;
}

export const authKey: InjectionKey<AuthController> = Symbol("videos-auth");

export function createAuth(options: CreateAuthOptions = {}): AuthController {
  const {
    checkTimeoutMilliseconds = 10_000,
    client = api,
    onSessionChange = () => undefined,
  } = options;
  const state = reactive<AuthControllerState>({
    profile: null,
    profileSelectionKey: null,
    status: "loading",
    passwordConfigured: false,
    setupEnabled: false,
    setupTokenRequired: false,
    error: "",
  });

  let sessionCheck: AbortController | null = null;
  let sessionCheckVersion = 0;
  function cancelSessionCheck(): void {
    sessionCheckVersion++;
    sessionCheck?.abort();
  }
  function handleUnauthorized(): void {
    cancelSessionCheck();
    onSessionChange();
    state.profile = null;
    state.profileSelectionKey = null;
    setProfileSession(null, null);
    state.status = "unauthenticated";
    state.passwordConfigured = true;
    state.error = "Your session expired. Sign in again.";
  }

  const channel = new BroadcastChannel("videos-session");
  function handleProfileChange(): void {
    void initialize();
  }
  channel.onmessage = handleProfileChange;
  if ("window" in globalThis) {
    globalThis.window.addEventListener("videos:profile-changed", handleProfileChange);
    globalThis.window.addEventListener("videos:unauthorized", handleUnauthorized);
  }

  async function initialize(): Promise<void> {
    cancelSessionCheck();
    const version = sessionCheckVersion;
    state.status = "loading";
    onSessionChange();
    state.error = "";
    const controller = new AbortController();
    sessionCheck = controller;
    const timeout = setTimeout(() => controller.abort(), checkTimeoutMilliseconds);
    try {
      const result = await client.getAuthState(controller.signal);
      if (version !== sessionCheckVersion) return;
      state.profile = result.profile;
      state.profileSelectionKey = result.profileSelectionKey;
      setProfileSession(result.profile?.id ?? null, result.profileSelectionKey);
      state.passwordConfigured = result.passwordConfigured;
      state.setupEnabled = result.setupEnabled;
      state.setupTokenRequired = result.setupTokenRequired;
      state.status = result.authenticated ? "authenticated" : "unauthenticated";
    } catch (caught) {
      if (version !== sessionCheckVersion) return;
      state.status = "error";
      if (controller.signal.aborted) state.error = "Session check timed out. Try again.";
      else if (caught instanceof Error) state.error = caught.message;
      else state.error = "Could not verify your session";
    } finally {
      clearTimeout(timeout);
    }
  }

  async function login(password: string): Promise<void> {
    await client.login(password);
    channel.postMessage("changed");
    await initialize();
  }

  async function changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<void> {
    await client.changePassword(currentPassword, newPassword, confirmPassword);
    channel.postMessage("changed");
    await initialize();
  }

  async function setupPassword(
    password: string,
    confirmPassword: string,
    adminName: string,
    adminPassword: string,
    setupToken?: string,
  ): Promise<void> {
    await client.setupPassword(password, confirmPassword, adminName, adminPassword, setupToken);
    state.passwordConfigured = true;
    await login(password);
  }

  async function selectProfile(profileId: string, password: string): Promise<void> {
    await client.selectProfile(profileId, password);
    channel.postMessage("changed");
    await initialize();
  }
  async function clearProfile(): Promise<void> {
    await client.clearProfile();
    channel.postMessage("changed");
    await initialize();
  }
  async function logout(): Promise<void> {
    await client.logout();
    cancelSessionCheck();
    channel.postMessage("changed");
    onSessionChange();
    state.profile = null;
    state.profileSelectionKey = null;
    setProfileSession(null, null);
    state.status = "unauthenticated";
    state.error = "";
  }

  return {
    changePassword,
    selectProfile,
    clearProfile,
    dispose: () => {
      cancelSessionCheck();
      channel.close();
      if ("window" in globalThis) {
        globalThis.window.removeEventListener("videos:profile-changed", handleProfileChange);
        globalThis.window.removeEventListener("videos:unauthorized", handleUnauthorized);
      }
    },
    initialize,
    login,
    logout,
    setupPassword,
    state: readonly(state),
  };
}

export function useAuth(): AuthController {
  const auth = inject(authKey);
  if (!auth) throw new Error("Auth provider is not installed");
  return auth;
}
