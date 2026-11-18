import { nextTick, shallowRef, type Ref } from "vue";

import type { PlaybackResult } from "@/api.js";

interface PlaybackClient {
  getConversionStatus(videoId: string): Promise<PlaybackResult>;
  retryConversion(videoId: string): Promise<PlaybackResult>;
}

interface PlaybackOptions {
  queuedPollMilliseconds?: number;
  startPosition?: () => number;
  onSourceAttached?: (videoId: string) => Promise<void>;
}

const activeConversionPollMilliseconds = 500;

export function useVideoPlayback(
  video: Ref<HTMLVideoElement | null>,
  client: PlaybackClient,
  {
    queuedPollMilliseconds = 2_000,
    startPosition = () => 0,
    onSourceAttached,
  }: PlaybackOptions = {},
) {
  const playback = shallowRef<PlaybackResult | null>(null);
  const error = shallowRef("");
  let hls: import("hls.js").default | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let metadataApplied = false;
  let requestSequence = 0;

  function startRequest(): number {
    return ++requestSequence;
  }

  function currentRequestId(): number {
    return requestSequence;
  }

  function isCurrentRequest(requestId: number): boolean {
    return requestId === requestSequence;
  }

  function clearSource(): void {
    clearTimeout(pollTimer);
    pollTimer = undefined;
    hls?.destroy();
    hls = null;
    metadataApplied = false;
    playback.value = null;
    if (video.value) {
      video.value.pause();
      video.value.removeAttribute("src");
      video.value.load();
    }
  }

  function disposePlayback(): void {
    requestSequence++;
    clearSource();
  }

  async function attachSource(
    url: string,
    kind: "direct" | "hls",
    requestId: number,
    startAt?: number,
  ): Promise<void> {
    await nextTick();
    if (!isCurrentRequest(requestId)) return;
    const element = video.value;
    if (!element) return;
    hls?.destroy();
    hls = null;
    metadataApplied = false;

    if (kind === "direct" || (!startAt && element.canPlayType("application/vnd.apple.mpegurl"))) {
      element.src = url;
      element.load();
      return;
    }
    const { default: Hls } = await import("hls.js/light");
    if (!isCurrentRequest(requestId)) return;
    if (!Hls.isSupported()) {
      error.value = "This browser cannot play this video.";
      return;
    }
    hls = new Hls({
      enableWorker: true,
      backBufferLength: 30,
      startPosition: startAt ?? -1,
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal && isCurrentRequest(requestId)) {
        error.value = "Video playback stopped unexpectedly. Try again.";
      }
    });
    hls.loadSource(url);
    hls.attachMedia(element);
  }

  async function canStartGrowingPlaylist(
    availableSeconds: number,
    startAt: number,
  ): Promise<boolean> {
    if (availableSeconds <= startAt) return false;
    if (!startAt || !video.value?.canPlayType("application/vnd.apple.mpegurl")) return true;

    // Native live playback may have no seekable range until the conversion finishes.
    try {
      const { default: Hls } = await import("hls.js/light");
      return Hls.isSupported();
    } catch {
      return false;
    }
  }

  async function applyPlayback(
    result: PlaybackResult,
    videoId: string,
    requestId: number,
  ): Promise<void> {
    if (!isCurrentRequest(requestId)) return;
    let startAt: number | undefined;
    if (result.kind === "hls" && result.status === "converting") {
      startAt = startPosition();
      const ready = await canStartGrowingPlaylist(result.availableSeconds ?? 0, startAt);
      if (!isCurrentRequest(requestId)) return;
      if (!ready) {
        result = { kind: "converting", status: "converting", progress: result.progress };
      }
    }
    playback.value = result;
    if (result.kind === "direct" || result.kind === "hls") {
      const growing = result.kind === "hls" && result.status === "converting";
      await attachSource(result.url, result.kind, requestId, startAt);
      if (!growing && isCurrentRequest(requestId) && !error.value)
        await onSourceAttached?.(videoId);
      return;
    }
    if (result.kind === "error") {
      error.value = result.message;
      return;
    }
    scheduleConversionPoll(result, videoId, requestId);
  }

  function scheduleConversionPoll(
    result: Extract<PlaybackResult, { kind: "converting" }>,
    videoId: string,
    requestId: number,
  ): void {
    const delay =
      result.status === "converting" ? activeConversionPollMilliseconds : queuedPollMilliseconds;
    pollTimer = setTimeout(async () => {
      if (!isCurrentRequest(requestId)) return;
      try {
        const conversion = await client.getConversionStatus(videoId);
        await applyPlayback(conversion, videoId, requestId);
      } catch {
        if (!isCurrentRequest(requestId)) return;
        error.value = "We couldn't check the video status. Try again.";
      }
    }, delay);
  }

  async function retryPlayback(videoId: string): Promise<void> {
    error.value = "";
    const requestId = requestSequence;
    const checkingStatus = playback.value?.kind === "converting";
    clearTimeout(pollTimer);
    pollTimer = undefined;
    try {
      const result = checkingStatus
        ? await client.getConversionStatus(videoId)
        : await client.retryConversion(videoId);
      await applyPlayback(result, videoId, requestId);
    } catch {
      if (!isCurrentRequest(requestId)) return;
      error.value = checkingStatus
        ? "We couldn't check the video status. Try again."
        : "We couldn't retry this video. Try again.";
    }
  }

  function applyMetadata(callback: (element: HTMLVideoElement) => void): void {
    const element = video.value;
    if (!element || metadataApplied) return;
    metadataApplied = true;
    callback(element);
  }

  return {
    applyPlayback,
    applyMetadata,
    clearSource,
    currentRequestId,
    disposePlayback,
    error,
    isCurrentRequest,
    playback,
    retryPlayback,
    startRequest,
  };
}
