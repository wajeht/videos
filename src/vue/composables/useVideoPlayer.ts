import { currentProfileSelectionKey, currentProfileId } from "@/api.js";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  api,
  apiErrorMessage,
  isLibraryResourceNotFound,
  type PlaybackResult,
  type PlaylistDetailDto,
  type VideoDetailDto,
  type VideoDto,
} from "@/api.js";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import { useConfirm } from "@/composables/useConfirm.js";
import { useMediaSession } from "@/composables/useMediaSession.js";
import { usePauseVideoOnHidden } from "@/composables/usePauseVideoOnHidden.js";
import { usePlaybackProgress } from "@/composables/usePlaybackProgress.js";
import { useScreenWakeLock } from "@/composables/useScreenWakeLock.js";
import { useToast } from "@/composables/useToast.js";
import { useVideoPlayback } from "@/composables/useVideoPlayback.js";
import { queryKeys, videoQueryOptions } from "@/queries.js";
import { notFoundLocation, playerLocation } from "@/router.js";
import { setPageTitle } from "@/utils.js";

export function useVideoPlayer(element: Ref<HTMLVideoElement | null>) {
  const selectionKey = currentProfileSelectionKey();
  const autoplayNextStorageKey = `videos:${currentProfileId()}:autoplay-next`;

  const route = useRoute();
  const router = useRouter();
  const queryClient = useQueryClient();
  const video = ref<VideoDetailDto | null>(null);
  const loadedPlaylist = ref<PlaylistDetailDto | null>(null);
  const loading = shallowRef(true);
  const ended = shallowRef(false);
  const currentTime = shallowRef(0);
  const autoplayNext = shallowRef(localStorage.getItem(autoplayNextStorageKey) === "true");
  const confirmation = useConfirm();
  const toast = useToast();
  const playback = useVideoPlayback(element, api);
  const progress = usePlaybackProgress(async (videoId, positionSeconds) => {
    await api.saveProgress(videoId, positionSeconds, selectionKey);
    await invalidateProgress();
  });
  const retry = useAsyncAction(async (videoId: string) => playback.retryPlayback(videoId));
  let regenerationController: AbortController | null = null;
  let autoplayVideoId: string | null = null;

  function isCurrentVideo(videoId: string): boolean {
    return String(route.params.videoId) === videoId && video.value?.id === videoId;
  }

  function cancelThumbnailRegeneration(): void {
    regenerationController?.abort();
  }

  const regenerate = useAsyncAction(
    async (videoId: string) => {
      const controller = new AbortController();
      regenerationController = controller;
      try {
        await api.regenerateVideoThumbnail(videoId, controller.signal);
        if (!isCurrentVideo(videoId)) return false;
        await Promise.all([
          invalidateLibrary(),
          queryClient.invalidateQueries({ queryKey: queryKeys.video(videoId) }),
        ]);
        const detail = await queryClient.fetchQuery(videoQueryOptions(videoId));
        if (!isCurrentVideo(videoId)) return false;
        video.value = detail.video;
        return true;
      } catch (caught) {
        if (controller.signal.aborted) return false;
        throw caught;
      } finally {
        if (regenerationController === controller) regenerationController = null;
      }
    },
    {
      errorMessage: "Could not regenerate thumbnails",
      onError: (caught) => {
        toast.error(apiErrorMessage(caught, "Could not regenerate thumbnails"));
      },
      onSuccess: (updated) => {
        if (!updated) return;
        toast.success("Thumbnails updated");
      },
    },
  );
  const reset = useAsyncAction(
    async (videoId: string) => {
      if (video.value?.id !== videoId || !progress.isSessionFor(videoId)) return false;
      await progress.resetSession(element.value?.currentTime, (id) =>
        api.resetVideo(id, selectionKey),
      );
      if (video.value?.id !== videoId) return false;
      video.value.positionSeconds = 0;
      video.value.progressPercent = 0;
      video.value.completed = false;
      ended.value = false;
      if (element.value) element.value.currentTime = 0;
      return true;
    },
    {
      errorMessage: "Could not reset this video",
      onError: (caught) => {
        toast.error(apiErrorMessage(caught, "Could not reset this video"));
      },
      onSuccess: async (didReset) => {
        if (!didReset) return;
        await invalidateProgress();
        toast.success("Video progress reset");
      },
    },
  );

  const playlist = computed(() => {
    const list = route.query.list;
    const loaded = loadedPlaylist.value;
    if (Array.isArray(list) || !list || !loaded || list !== loaded.id) return null;
    return loaded;
  });
  const playlistVideos = computed(
    () => playlist.value?.sections.flatMap((section) => section.videos) ?? [],
  );
  const resetPlaylist = useAsyncAction(
    async (playlistId: string) => {
      const activeVideo = video.value;
      const activePlaylist = playlist.value;
      if (
        activePlaylist?.id !== playlistId ||
        !activeVideo ||
        !progress.isSessionFor(activeVideo.id)
      )
        return false;
      await progress.resetSession(element.value?.currentTime, () =>
        api.resetPlaylist(playlistId, selectionKey),
      );
      if (playlist.value?.id !== playlistId || video.value?.id !== activeVideo.id) return false;

      for (const item of playlistVideos.value) {
        item.positionSeconds = 0;
        item.progressPercent = 0;
        item.completed = false;
      }
      activePlaylist.completedCount = 0;
      activePlaylist.progressPercent = 0;
      activeVideo.positionSeconds = 0;
      activeVideo.progressPercent = 0;
      activeVideo.completed = false;
      ended.value = false;
      currentTime.value = 0;
      if (element.value) element.value.currentTime = 0;
      return true;
    },
    {
      errorMessage: "Could not reset this playlist",
      onError: (caught) => {
        toast.error(apiErrorMessage(caught, "Could not reset this playlist"));
      },
      onSuccess: async (didReset) => {
        if (!didReset) return;
        await invalidateProgress();
        toast.success("Playlist progress reset");
      },
    },
  );
  const currentIndex = computed(() =>
    playlistVideos.value.findIndex((item) => item.id === video.value?.id),
  );
  const previousVideo = computed(() =>
    currentIndex.value > 0 ? playlistVideos.value[currentIndex.value - 1] : undefined,
  );
  const nextVideo = computed(() =>
    currentIndex.value >= 0 ? playlistVideos.value[currentIndex.value + 1] : undefined,
  );
  const posterUrl = computed(() => {
    const detail = video.value;
    if (!detail) return undefined;
    let chapterThumbnail: string | null = null;
    for (const chapter of detail.chapters) {
      if (chapter.startSeconds > currentTime.value) break;
      chapterThumbnail = chapter.thumbnailUrl;
    }
    return chapterThumbnail ?? detail.coverUrl ?? undefined;
  });
  const mediaMetadata = computed(() =>
    video.value
      ? {
          title: video.value.title,
          artist: video.value.authors.join(", ") || "Videos",
          album: playlist.value?.title ?? "Videos",
          artwork: posterUrl.value ?? null,
        }
      : null,
  );

  function invalidateLibrary() {
    return queryClient.invalidateQueries({ queryKey: queryKeys.library, refetchType: "none" });
  }
  async function invalidateProgress() {
    await Promise.all([
      invalidateLibrary(),
      queryClient.invalidateQueries({ queryKey: queryKeys.videos, refetchType: "none" }),
    ]);
  }
  function navigate(target: VideoDto | undefined) {
    if (target) void router.push(playerLocation(target.id, target.playlistId));
  }

  function setAutoplayNext(enabled: boolean): void {
    autoplayNext.value = enabled;
    if (enabled) localStorage.setItem(autoplayNextStorageKey, "true");
    else localStorage.removeItem(autoplayNextStorageKey);
  }

  function prepareAutoplay(videoId: string): void {
    const shouldAutoplay = autoplayVideoId === videoId;
    if (autoplayVideoId && !shouldAutoplay) autoplayVideoId = null;
    if (element.value) element.value.autoplay = shouldAutoplay;
  }

  async function startAutoplay(videoId: string, result: PlaybackResult): Promise<void> {
    if (
      autoplayVideoId !== videoId ||
      !element.value ||
      (result.kind !== "direct" && result.kind !== "hls")
    )
      return;
    autoplayVideoId = null;
    await element.value.play().catch(() => undefined);
  }

  useMediaSession(element, mediaMetadata, {
    previous: () => navigate(previousVideo.value),
    next: () => navigate(nextVideo.value),
  });
  useScreenWakeLock(element);
  usePauseVideoOnHidden(element);

  function queryTimestamp(): number | null {
    const queryValue = route.query.t;
    const timestamp = Array.isArray(queryValue) ? queryValue[0] : queryValue;
    if (!timestamp?.trim()) return null;
    const seconds = Number(timestamp);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  function seek(seconds: number) {
    if (!element.value) return;
    element.value.currentTime = Number.isFinite(element.value.duration)
      ? Math.min(seconds, Math.max(0, element.value.duration - 0.001))
      : seconds;
    currentTime.value = element.value.currentTime;
  }

  async function loadPlayer() {
    const requestId = playback.startRequest();
    if (ended.value) progress.stopSession();
    else await progress.finishSession(element.value?.currentTime);
    if (!playback.isCurrentRequest(requestId)) return;
    progress.clearSession();
    playback.clearSource();
    loading.value = true;
    playback.error.value = "";
    ended.value = false;
    currentTime.value = 0;
    try {
      const videoId = String(route.params.videoId);
      prepareAutoplay(videoId);
      const [detail, playbackResult] = await Promise.all([
        queryClient.fetchQuery(videoQueryOptions(videoId)),
        api.preparePlayback(videoId),
      ]);
      if (!playback.isCurrentRequest(requestId)) return;
      await api.openVideo(videoId, selectionKey);
      await invalidateLibrary();
      if (!playback.isCurrentRequest(requestId)) return;
      video.value = detail.video;
      loadedPlaylist.value = detail.playlist;
      const timestamp = queryTimestamp();
      currentTime.value = timestamp ?? (!detail.video.completed ? detail.video.positionSeconds : 0);
      setPageTitle(detail.video.title);
      progress.startSession(detail.video.id, detail.video.positionSeconds);
      await playback.applyPlayback(playbackResult, videoId, requestId);
      await startAutoplay(videoId, playbackResult);
    } catch (caught) {
      if (!playback.isCurrentRequest(requestId)) return;
      if (isLibraryResourceNotFound(caught)) {
        await router.replace(notFoundLocation(route.path));
        return;
      }
      playback.error.value = apiErrorMessage(caught, "Could not load this video");
    } finally {
      if (playback.isCurrentRequest(requestId)) loading.value = false;
    }
  }

  function applyResume() {
    playback.applyMetadata((media) => {
      if (!video.value || !progress.isSessionFor(video.value.id)) return;
      const timestamp = queryTimestamp();
      if (timestamp !== null)
        media.currentTime = Math.min(timestamp, Math.max(0, media.duration - 0.001));
      else if (!video.value.completed && video.value.positionSeconds > 0)
        media.currentTime = Math.min(video.value.positionSeconds, Math.max(0, media.duration - 1));
      currentTime.value = media.currentTime;
      progress.activateSession(media.currentTime);
    });
  }
  function onTimeUpdate() {
    currentTime.value = element.value?.currentTime ?? 0;
    progress.recordPosition(element.value?.currentTime);
    if (!ended.value) void progress.persistProgress();
  }
  function onPause() {
    progress.recordPosition(element.value?.currentTime);
    if (!ended.value) void progress.persistProgress(true);
  }
  function saveOnExit() {
    if (ended.value) return;
    const snapshot = progress.captureExitSnapshot(element.value?.currentTime);
    if (!snapshot) return;
    void fetch(`/api/progress/videos/${snapshot.videoId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-profile-selection": selectionKey },
      body: JSON.stringify({ positionSeconds: snapshot.positionSeconds }),
      keepalive: true,
    });
  }
  async function markComplete() {
    if (!video.value) return;
    const autoplayTarget = autoplayNext.value ? nextVideo.value : undefined;
    try {
      await api.completeVideo(video.value.id, selectionKey);
      await invalidateProgress();
      ended.value = true;
      progress.stopSession();
      video.value.completed = true;
      video.value.progressPercent = 100;
      if (autoplayTarget) {
        autoplayVideoId = autoplayTarget.id;
        await router.push(playerLocation(autoplayTarget.id, autoplayTarget.playlistId));
      }
    } catch (caught) {
      playback.error.value = apiErrorMessage(caught, "Could not complete this video");
    }
  }
  async function resetProgress() {
    if (!video.value) return;
    const id = video.value.id;
    const confirmed = await confirmation.confirm({
      title: "Reset video progress?",
      message: "Your saved position and completion state for this video will be removed.",
      confirmLabel: "Reset progress",
      variant: "danger",
    });
    if (confirmed && video.value?.id === id) await reset.run(id);
  }
  async function regenerateThumbnail() {
    if (video.value) await regenerate.run(video.value.id);
  }
  async function resetPlaylistProgress() {
    const id = playlist.value?.id;
    if (!id) return;
    const confirmed = await confirmation.confirm({
      title: "Reset playlist progress?",
      message:
        "Saved positions and completion states for every video in this playlist will be removed.",
      confirmLabel: "Reset playlist progress",
      variant: "danger",
    });
    if (confirmed && playlist.value?.id === id) await resetPlaylist.run(id);
  }
  function handleVisibility() {
    if (document.visibilityState !== "hidden") return;
    progress.recordPosition(element.value?.currentTime);
    if (!ended.value) void progress.persistProgress(true);
  }

  watch(
    () => route.params.videoId,
    () => {
      cancelThumbnailRegeneration();
      void loadPlayer();
    },
    { immediate: true },
  );
  watch(
    () => route.query.t,
    () => {
      const timestamp = queryTimestamp();
      if (timestamp === null) return;
      if (element.value?.readyState) seek(timestamp);
      else currentTime.value = timestamp;
    },
  );
  window.addEventListener("pagehide", saveOnExit);
  document.addEventListener("visibilitychange", handleVisibility);
  onBeforeUnmount(() => {
    cancelThumbnailRegeneration();
    if (ended.value) progress.stopSession();
    else void progress.finishSession(element.value?.currentTime);
    progress.clearSession();
    playback.disposePlayback();
    window.removeEventListener("pagehide", saveOnExit);
    document.removeEventListener("visibilitychange", handleVisibility);
  });

  return {
    applyResume,
    autoplayNext: computed(() => autoplayNext.value),
    currentTime: computed(() => currentTime.value),
    ended: computed(() => ended.value),
    error: computed(() => playback.error.value),
    loading: computed(() => loading.value),
    markComplete,
    nextVideo,
    onPause,
    onTimeUpdate,
    playback: computed(() => playback.playback.value),
    playlist,
    posterUrl,
    regenerateThumbnail,
    regenerating: computed(() => regenerate.pending.value),
    resetPlaylistProgress,
    resetProgress,
    resettingPlaylist: computed(() => resetPlaylist.pending.value),
    resetting: computed(() => reset.pending.value),
    retryConversion: async () => {
      if (video.value) await retry.run(video.value.id);
    },
    retrying: computed(() => retry.pending.value),
    seekToChapter: (seconds: number) => {
      seek(seconds);
      void router.replace({ query: { ...route.query, t: String(seconds) } });
    },
    setAutoplayNext,
    video: computed(() => video.value),
  };
}
