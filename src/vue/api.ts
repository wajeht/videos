import type {
  ProfileDto,
  CreateProfileInput,
  UpdateProfileInput,
} from "../profiles/profiles.schema";
export type { ProfileDto, CreateProfileInput, UpdateProfileInput };
import { hc } from "hono/client";
import { z } from "zod";

import type { AppType } from "../app";
import type {
  ChapterDto,
  LibraryFilters,
  LibraryView,
  LibraryService,
  PlaylistDetailDto,
  VideoDto,
  VideoDetailDto,
} from "../library/library.service";
import type { ScanStatus } from "../media/types";
import type { ThumbnailRegenerationStatus } from "../media/thumbnails";
import type { PlaybackResult } from "../playback/playback.service";
import type { LibraryPageSize, SettingsDto } from "../settings/settings.service";

let profileSelectionKey: string | null = null;
let profileId: string | null = null;
export function setProfileSession(id: string | null, key: string | null): void {
  profileId = id;
  profileSelectionKey = key;
}
export function currentProfileId(): string {
  if (!profileId) throw new Error("A profile must be selected before playback");
  return profileId;
}
export function currentProfileSelectionKey(): string {
  if (!profileSelectionKey) throw new Error("A profile must be selected before playback");
  return profileSelectionKey;
}
const apiClient = hc<AppType>("/", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (profileSelectionKey && !headers.has("x-profile-selection"))
      headers.set("x-profile-selection", profileSelectionKey);
    return fetch(input, { ...init, headers });
  },
});

export interface AuthStateDto {
  authenticated: boolean;
  profile: ProfileDto | null;
  profileSelectionKey: string | null;
  passwordConfigured: boolean;
  setupEnabled: boolean;
  setupTokenRequired: boolean;
}

export type LibraryDto = Awaited<ReturnType<LibraryService["getLibrary"]>>;
export interface VideoPlayerDetailDto {
  video: VideoDetailDto;
  playlist: PlaylistDetailDto | null;
}

export type {
  ChapterDto,
  LibraryFilters,
  LibraryPageSize,
  LibraryView,
  PlaybackResult,
  PlaylistDetailDto,
  ScanStatus,
  SettingsDto,
  VideoDetailDto,
  VideoDto,
};

const thumbnailPollMilliseconds = 500;
const thumbnailPollLimit = 1_200;
const errorResponseSchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
});

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, milliseconds));
  const abortSignal = signal;
  return new Promise((resolve, reject) => {
    if (abortSignal.aborted) {
      reject(abortSignal.reason);
      return;
    }
    const timeout = setTimeout(() => {
      abortSignal.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);
    function cancel(): void {
      clearTimeout(timeout);
      reject(abortSignal.reason);
    }
    abortSignal.addEventListener("abort", cancel, { once: true });
  });
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function apiErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError && cause.message.trim() ? cause.message : fallback;
}

export function isLibraryResourceNotFound(cause: unknown): cause is ApiError {
  return cause instanceof ApiError && (cause.status === 400 || cause.status === 404);
}

export async function expectJson<T>(response: Response, notifyUnauthorized = false): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    if (notifyUnauthorized && response.status === 401 && "window" in globalThis) {
      globalThis.window.dispatchEvent(new Event("videos:unauthorized"));
    }
    const errorBody = errorResponseSchema.safeParse(body);
    if (errorBody.success && errorBody.data.code === "PROFILE_CHANGED" && "window" in globalThis) {
      globalThis.window.dispatchEvent(new Event("videos:profile-changed"));
    }
    throw new ApiError(
      errorBody.success ? (errorBody.data.message ?? "Request failed") : "Request failed",
      response.status,
    );
  }
  // SAFETY: The Hono client derives successful response contracts from AppType in this same build.
  return body as T;
}

export function expectProtectedJson<T>(response: Response): Promise<T> {
  return expectJson<T>(response, true);
}

export const api = {
  async getAuthState(signal?: AbortSignal): Promise<AuthStateDto> {
    return expectJson(await apiClient.api.auth.me.$get({}, { init: { signal } }));
  },
  async login(password: string): Promise<void> {
    await expectJson(await apiClient.api.auth.$post({ json: { password } }));
  },
  async logout(): Promise<void> {
    await expectJson(await apiClient.api.auth.logout.$post());
  },
  async setupPassword(
    password: string,
    confirmPassword: string,
    adminName: string,
    adminPin: string,
    setupToken?: string,
  ): Promise<void> {
    await expectJson(
      await apiClient.api.auth.password.$post({
        json: { password, confirmPassword, adminName, adminPin, setupToken },
      }),
    );
  },
  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<void> {
    await expectProtectedJson(
      await apiClient.api.auth.password.$put({
        json: { currentPassword, newPassword, confirmPassword },
      }),
    );
  },
  async listProfiles(): Promise<ProfileDto[]> {
    return expectProtectedJson(await apiClient.api.profiles.$get());
  },
  async selectProfile(profileId: string, pin: string): Promise<void> {
    await expectProtectedJson(
      await apiClient.api.profiles[":profileId"].select.$post({
        param: { profileId },
        json: { pin },
      }),
    );
  },
  async clearProfile(): Promise<void> {
    await expectProtectedJson(await apiClient.api.profiles.clear.$post());
  },
  async createProfile(input: CreateProfileInput): Promise<ProfileDto> {
    return expectProtectedJson(await apiClient.api.profiles.$post({ json: input }));
  },
  async updateProfile(profileId: string, input: UpdateProfileInput): Promise<void> {
    await expectProtectedJson(
      await apiClient.api.profiles[":profileId"].$put({ param: { profileId }, json: input }),
    );
  },
  async changeProfilePin(profileId: string, pin: string | null): Promise<void> {
    await expectProtectedJson(
      await apiClient.api.profiles[":profileId"].pin.$put({
        param: { profileId },
        json: { pin },
      }),
    );
  },
  async deleteProfile(profileId: string): Promise<void> {
    await expectProtectedJson(
      await apiClient.api.profiles[":profileId"].$delete({ param: { profileId } }),
    );
  },
  async getLibrary(filters: LibraryFilters = {}, signal?: AbortSignal): Promise<LibraryDto> {
    const response = await apiClient.api.library.$get(
      {
        query: {
          ...filters,
          page: filters.page === undefined ? undefined : String(filters.page),
          pageSize: filters.pageSize === undefined ? undefined : String(filters.pageSize),
        },
      },
      { init: { signal } },
    );
    return expectProtectedJson<LibraryDto>(response);
  },
  async getVideo(videoId: string, signal?: AbortSignal): Promise<VideoPlayerDetailDto> {
    return expectProtectedJson<VideoPlayerDetailDto>(
      await apiClient.api.videos[":videoId"].$get({ param: { videoId } }, { init: { signal } }),
    );
  },
  async regenerateVideoThumbnail(videoId: string, signal?: AbortSignal): Promise<void> {
    let status = await expectProtectedJson<ThumbnailRegenerationStatus>(
      await apiClient.api.videos[":videoId"].thumbnail.$post(
        { param: { videoId } },
        { init: { signal } },
      ),
    );
    for (let attempt = 0; attempt < thumbnailPollLimit; attempt += 1) {
      if (status.status === "complete") return;
      if (status.status === "failed" || status.status === "idle") {
        throw new ApiError("Could not regenerate thumbnails", 500);
      }
      await wait(thumbnailPollMilliseconds, signal);
      status = await expectProtectedJson<ThumbnailRegenerationStatus>(
        await apiClient.api.videos[":videoId"].thumbnail.$get(
          { param: { videoId } },
          { init: { signal } },
        ),
      );
    }
    throw new ApiError("Thumbnail regeneration timed out", 408);
  },
  async preparePlayback(videoId: string): Promise<PlaybackResult> {
    return expectProtectedJson<PlaybackResult>(
      await apiClient.api.playback[":videoId"].$post({ param: { videoId } }),
    );
  },
  async openVideo(videoId: string, selectionKey: string): Promise<void> {
    await expectProtectedJson(
      await apiClient.api.progress.videos[":videoId"].open.$post(
        { param: { videoId } },
        { headers: { "x-profile-selection": selectionKey } },
      ),
    );
  },
  async getConversionStatus(videoId: string): Promise<PlaybackResult> {
    return expectProtectedJson<PlaybackResult>(
      await apiClient.api.playback[":videoId"].conversion.$get({ param: { videoId } }),
    );
  },
  async retryConversion(videoId: string): Promise<PlaybackResult> {
    return expectProtectedJson<PlaybackResult>(
      await apiClient.api.playback[":videoId"].retry.$post({ param: { videoId } }),
    );
  },
  async saveProgress(
    videoId: string,
    positionSeconds: number,
    selectionKey: string,
  ): Promise<void> {
    await expectProtectedJson(
      await apiClient.api.progress.videos[":videoId"].$put(
        {
          param: { videoId },
          json: { positionSeconds },
        },
        { headers: { "x-profile-selection": selectionKey } },
      ),
    );
  },
  async completeVideo(videoId: string, selectionKey: string): Promise<void> {
    await expectProtectedJson(
      await apiClient.api.progress.videos[":videoId"].complete.$post(
        { param: { videoId } },
        { headers: { "x-profile-selection": selectionKey } },
      ),
    );
  },
  async resetVideo(videoId: string, selectionKey: string): Promise<void> {
    await expectProtectedJson(
      await apiClient.api.progress.videos[":videoId"].$delete(
        { param: { videoId } },
        { headers: { "x-profile-selection": selectionKey } },
      ),
    );
  },
  async resetPlaylist(playlistId: string, selectionKey: string): Promise<void> {
    await expectProtectedJson(
      await apiClient.api.progress.playlists[":playlistId"].$delete(
        { param: { playlistId } },
        { headers: { "x-profile-selection": selectionKey } },
      ),
    );
  },
  async getSettings(signal?: AbortSignal): Promise<SettingsDto> {
    return expectProtectedJson<SettingsDto>(
      await apiClient.api.settings.$get({}, { init: { signal } }),
    );
  },
  async updateSettings(libraryPageSize: LibraryPageSize): Promise<SettingsDto> {
    return expectProtectedJson<SettingsDto>(
      await apiClient.api.settings.$put({ json: { libraryPageSize } }),
    );
  },
  async getScanStatus(signal?: AbortSignal): Promise<ScanStatus> {
    return expectProtectedJson<ScanStatus>(await apiClient.api.scan.$get({}, { init: { signal } }));
  },
  async rescanLibrary(): Promise<ScanStatus> {
    return expectProtectedJson<ScanStatus>(await apiClient.api.scan.$post());
  },
};
