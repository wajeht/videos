import { nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlaybackResult } from "@/api.js";
import { useVideoPlayback } from "./useVideoPlayback.js";

function videoElement() {
  const element = document.createElement("video");
  vi.spyOn(element, "canPlayType").mockReturnValue("");
  vi.spyOn(element, "load").mockImplementation(() => undefined);
  vi.spyOn(element, "pause").mockImplementation(() => undefined);
  vi.spyOn(element, "removeAttribute");
  return element;
}

function playbackClient(result: PlaybackResult = { kind: "direct", url: "/media/video" }) {
  return {
    getConversionStatus: vi.fn(async () => result),
    retryConversion: vi.fn(async () => result),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useVideoPlayback", () => {
  it("attaches a direct source for the current request", async () => {
    const element = videoElement();
    const client = playbackClient();
    const video = ref<HTMLVideoElement | null>(element);
    const playback = useVideoPlayback(video, client);
    const requestId = playback.startRequest();

    await playback.applyPlayback({ kind: "direct", url: "/media/video" }, "video", requestId);

    expect(element.getAttribute("src")).toBe("/media/video");
    expect(element.load).toHaveBeenCalledOnce();
    expect(playback.playback.value).toEqual({ kind: "direct", url: "/media/video" });
  });

  it("does not attach a source from a stale request", async () => {
    const element = videoElement();
    const client = playbackClient();
    const playback = useVideoPlayback(ref(element), client);
    const requestId = playback.startRequest();

    playback.startRequest();
    await playback.applyPlayback({ kind: "direct", url: "/media/stale" }, "video", requestId);

    expect(element.src).toBe("");
    expect(element.load).not.toHaveBeenCalled();
  });

  it("polls a conversion until playback is available", async () => {
    vi.useFakeTimers();
    const element = videoElement();
    const client = playbackClient({ kind: "converting", status: "queued", progress: 0 });
    client.getConversionStatus.mockResolvedValueOnce({ kind: "direct", url: "/media/ready" });
    const playback = useVideoPlayback(ref(element), client, 100);
    const requestId = playback.startRequest();

    await playback.applyPlayback(
      { kind: "converting", status: "queued", progress: 0 },
      "video",
      requestId,
    );
    await vi.advanceTimersByTimeAsync(100);
    await nextTick();

    expect(client.getConversionStatus).toHaveBeenCalledWith("video");
    expect(element.getAttribute("src")).toBe("/media/ready");
  });

  it("hides technical errors when conversion status cannot be checked", async () => {
    vi.useFakeTimers();
    const client = playbackClient({ kind: "converting", status: "queued", progress: 0 });
    client.getConversionStatus.mockRejectedValueOnce(new Error("Conversion record missing"));
    const playback = useVideoPlayback(ref(videoElement()), client, 100);
    const requestId = playback.startRequest();

    await playback.applyPlayback(
      { kind: "converting", status: "queued", progress: 0 },
      "video",
      requestId,
    );
    await vi.advanceTimersByTimeAsync(100);

    expect(playback.error.value).toBe("We couldn't check the video status. Try again.");
  });

  it("rechecks a failed status request without restarting conversion", async () => {
    vi.useFakeTimers();
    const element = videoElement();
    const client = playbackClient();
    client.getConversionStatus.mockRejectedValueOnce(new Error("Offline"));
    const playback = useVideoPlayback(ref(element), client, 100);
    await playback.applyPlayback(
      { kind: "converting", status: "queued", progress: 0 },
      "video",
      playback.startRequest(),
    );
    await vi.advanceTimersByTimeAsync(100);
    await playback.retryPlayback("video");
    expect(client.getConversionStatus).toHaveBeenCalledTimes(2);
    expect(client.retryConversion).not.toHaveBeenCalled();
    expect(playback.error.value).toBe("");
    expect(element.getAttribute("src")).toBe("/media/video");
  });

  it("keeps a failed status retry visible and retryable", async () => {
    const client = playbackClient();
    client.getConversionStatus.mockRejectedValue(new Error("Offline"));
    const playback = useVideoPlayback(ref(videoElement()), client);
    await playback.applyPlayback(
      { kind: "converting", status: "queued", progress: 0 },
      "video",
      playback.startRequest(),
    );
    await playback.retryPlayback("video");
    expect(playback.error.value).toBe("We couldn't check the video status. Try again.");
    expect(client.retryConversion).not.toHaveBeenCalled();
    playback.disposePlayback();
  });

  it("restarts conversion when the job itself failed", async () => {
    const client = playbackClient();
    const playback = useVideoPlayback(ref(videoElement()), client);
    await playback.applyPlayback(
      { kind: "error", message: "Conversion failed" },
      "video",
      playback.startRequest(),
    );
    await playback.retryPlayback("video");
    expect(client.retryConversion).toHaveBeenCalledWith("video");
    expect(client.getConversionStatus).not.toHaveBeenCalled();
    expect(playback.error.value).toBe("");
  });

  it("applies resume metadata once for each source", async () => {
    const element = videoElement();
    const playback = useVideoPlayback(ref(element), playbackClient());
    const callback = vi.fn();
    const requestId = playback.startRequest();
    await playback.applyPlayback({ kind: "direct", url: "/media/video" }, "video", requestId);

    playback.applyMetadata(callback);
    playback.applyMetadata(callback);
    expect(callback).toHaveBeenCalledOnce();

    playback.clearSource();
    playback.applyMetadata(callback);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("invalidates requests and tears down the media element", () => {
    const element = videoElement();
    const playback = useVideoPlayback(ref(element), playbackClient());
    const requestId = playback.startRequest();

    playback.disposePlayback();

    expect(playback.isCurrentRequest(requestId)).toBe(false);
    expect(element.pause).toHaveBeenCalledOnce();
    expect(element.removeAttribute).toHaveBeenCalledWith("src");
    expect(element.load).toHaveBeenCalledOnce();
  });
});
