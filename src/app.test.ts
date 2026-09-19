import { selectTestAdmin, testAdminPassword } from "./test/auth.js";
import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import { createConfiguration } from "./config.js";
import { conversionPlaylistFilename, hlsDirectory } from "./media/conversion.js";
import { playlistCoverPath, playlistCoversDirectory } from "./media/playlist-covers.js";
import { createTemporaryDirectory, createTestContext } from "./test/resources.js";
import {
  chapterThumbnailPath,
  thumbnailCacheVersion,
  thumbnailPath,
  thumbnailsDirectory,
} from "./media/thumbnails.js";

describe("application", () => {
  it("reports invalid stored settings as a server error while rejecting invalid input", async () => {
    const directory = await createTemporaryDirectory("videos-errors-");
    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: path.join(directory, "videos"),
      DATA_DIR: path.join(directory, "data"),
    });
    const context = await createTestContext(configuration);
    await context.auth.setupPassword("test-library-password");
    await context.auth.setupAdminProfile("Admin", testAdminPassword);
    configuration.app.env = "production";
    const logError = vi.spyOn(context.logger, "error").mockImplementation(() => {});
    const app = createApp(context);
    const login = await app.request("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "test-library-password" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const selection = await selectTestAdmin(app, cookie);
    const headers = {
      cookie,
      "content-type": "application/json",
      "x-profile-selection": selection,
    };
    const invalidInput = await app.request("/api/settings", {
      method: "PUT",
      headers,
      body: JSON.stringify({ libraryPageSize: 13 }),
    });
    expect(invalidInput.status).toBe(400);
    expect(logError).not.toHaveBeenCalled();

    await context.database.connection("profile_settings").update({ value: "invalid" });
    const response = await app.request("/api/settings", { headers });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "The server could not complete the request",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(logError).toHaveBeenCalledWith("request failed", {
      error: expect.any(Error),
      path: "/api/settings",
    });
  });

  it("serves health, byte ranges, and production routes", async () => {
    const directory = await createTemporaryDirectory("videos-app-");
    const videos = path.join(directory, "videos");
    const playlist = path.join(videos, "playlist");
    await fs.mkdir(playlist, { recursive: true });
    await fs.writeFile(path.join(playlist, "video.mp4"), "0123456789");
    await fs.writeFile(path.join(playlist, "cover.jpg"), "cover");
    const configuration = createConfiguration({
      APP_ENV: "testing",
      VIDEOS_DIR: videos,
      DATA_DIR: path.join(directory, "data"),
      AUTH_SETUP_TOKEN: "videos-app-test-setup-token",
    });
    configuration.app.env = "production";
    const context = await createTestContext(configuration);
    const logInfo = vi.spyOn(context.logger, "info").mockImplementation(() => {});
    const clientDirectory = path.join(directory, "client");
    await fs.mkdir(clientDirectory);
    await fs.writeFile(path.join(clientDirectory, "index.html"), "SPA");
    await fs.writeFile(path.join(clientDirectory, "robots.txt"), "User-agent: *\nDisallow: /\n");
    await fs.writeFile(path.join(clientDirectory, "favicon.ico"), "ico");
    await fs.writeFile(path.join(clientDirectory, "favicon.svg"), "<svg></svg>");
    await fs.writeFile(path.join(clientDirectory, "manifest.webmanifest"), "{}");
    const now = new Date().toISOString();
    await context.database.connection("playlists").insert({
      id: "a".repeat(24),
      path: "playlist",
      title: "Playlist",
      description: "",
      cover_path: "playlist/cover.jpg",
      sort_order: 0,
    });
    await context.database.connection("videos").insert({
      id: "b".repeat(24),
      playlist_id: "a".repeat(24),
      path: "playlist/video.mp4",
      title: "Video",
      sort_order: 0,
      duration_seconds: 10,
      size_bytes: 10,
      container: "mp4",
      video_codec: "h264",
      audio_codec: "aac",
      browser_compatible: true,
      modified_at: now,
    });
    await context.database.connection("chapters").insert({
      id: "c".repeat(24),
      video_id: "b".repeat(24),
      title: "Introduction",
      start_seconds: 0,
      sort_order: 0,
    });
    const app = createApp(context, clientDirectory);

    expect(await (await app.request("/healthz")).json()).toEqual({ status: "ok" });
    expect((await app.request("/api/library")).status).toBe(401);
    expect((await app.request(`/media/${"b".repeat(24)}`)).status).toBe(401);
    expect((await app.request(`/covers/playlists/${"a".repeat(24)}`)).status).toBe(401);
    expect((await app.request(`/hls/${"b".repeat(24)}/${conversionPlaylistFilename}`)).status).toBe(
      401,
    );
    expect(
      (
        await app.request(`/api/videos/${"b".repeat(24)}/thumbnail`, {
          method: "POST",
          headers: { origin: "http://localhost" },
        })
      ).status,
    ).toBe(401);

    const rejectedSetup = await app.request("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: "videos-test-password",
        confirmPassword: "videos-test-password",
        setupToken: "wrong-setup-token",
      }),
    });
    expect(rejectedSetup.status).toBe(400);

    const setup = await app.request("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: "videos-test-password",
        confirmPassword: "videos-test-password",
        setupToken: "videos-app-test-setup-token",
      }),
    });
    expect(setup.status).toBe(201);
    const login = await app.request("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "videos-test-password" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();
    expect(
      (
        await app.request("/api/auth/admin-profile", {
          method: "POST",
          headers: { cookie: cookie!, "content-type": "application/json" },
          body: JSON.stringify({ name: "Admin", password: testAdminPassword }),
        })
      ).status,
    ).toBe(201);
    const selectionKey = await selectTestAdmin(app, cookie!);

    const regenerate = vi
      .spyOn(context.thumbnails, "startRegeneration")
      .mockReturnValue({ status: "running" });
    const regenerateResponse = await app.request(`/api/videos/${"b".repeat(24)}/thumbnail`, {
      method: "POST",
      headers: { cookie: cookie!, "x-profile-selection": selectionKey, origin: "http://localhost" },
    });
    expect(regenerateResponse.status).toBe(202);
    await expect(regenerateResponse.json()).resolves.toEqual({ status: "running" });
    expect(regenerate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b".repeat(24), path: "playlist/video.mp4" }),
      [{ videoId: "b".repeat(24), startSeconds: 0, sortOrder: 0 }],
    );
    vi.spyOn(context.thumbnails, "regenerationStatus").mockReturnValue({
      status: "complete",
      revision: 1,
    });
    const regenerationStatus = await app.request(`/api/videos/${"b".repeat(24)}/thumbnail`, {
      headers: { cookie: cookie!, "x-profile-selection": selectionKey },
    });
    expect(regenerationStatus.status).toBe(200);
    await expect(regenerationStatus.json()).resolves.toEqual({ status: "complete", revision: 1 });

    logInfo.mockClear();
    const response = await app.request(`/media/${"b".repeat(24)}`, {
      headers: { range: "bytes=2-5", cookie: cookie!, "x-profile-selection": selectionKey },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await response.text()).toBe("2345");
    expect(logInfo).not.toHaveBeenCalled();

    const videoHlsDirectory = path.join(
      hlsDirectory(configuration.media.dataDirectory),
      "b".repeat(24),
    );
    await fs.mkdir(videoHlsDirectory, { recursive: true });
    await fs.writeFile(path.join(videoHlsDirectory, conversionPlaylistFilename), "#EXTM3U");
    const hls = await app.request(`/hls/${"b".repeat(24)}/${conversionPlaylistFilename}`, {
      headers: { cookie: cookie!, "x-profile-selection": selectionKey },
    });
    expect(hls.status).toBe(200);
    expect(await hls.text()).toBe("#EXTM3U");
    expect(logInfo).not.toHaveBeenCalled();

    await app.request("/healthz");
    expect(logInfo).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({ path: "/healthz", status: 200 }),
    );

    const playlistRevision = 456;
    const optimizedPlaylistCover = playlistCoverPath(
      playlistCoversDirectory(configuration.media.dataDirectory),
      "a".repeat(24),
      playlistRevision,
    );
    await fs.mkdir(path.dirname(optimizedPlaylistCover), { recursive: true });
    await fs.writeFile(optimizedPlaylistCover, "optimized-cover");
    const cover = await app.request(`/covers/playlists/${"a".repeat(24)}?t=${playlistRevision}`, {
      headers: { cookie: cookie!, "x-profile-selection": selectionKey },
    });
    expect(cover.status).toBe(200);
    expect(cover.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(cover.headers.get("vary")).toBe("Cookie");
    expect(await cover.text()).toBe("optimized-cover");

    const missingVideoCover = await app.request(`/covers/videos/${"b".repeat(24)}`, {
      headers: { cookie: cookie!, "x-profile-selection": selectionKey },
    });
    expect(missingVideoCover.status).toBe(404);

    const revision = 123;
    const videoId = "b".repeat(24);
    await fs.mkdir(
      path.dirname(
        thumbnailPath(thumbnailsDirectory(configuration.media.dataDirectory), videoId, revision),
      ),
      {
        recursive: true,
      },
    );
    await fs.writeFile(
      thumbnailPath(thumbnailsDirectory(configuration.media.dataDirectory), videoId, revision),
      "thumb",
    );
    await fs.writeFile(
      chapterThumbnailPath(
        thumbnailsDirectory(configuration.media.dataDirectory),
        videoId,
        revision,
        0,
      ),
      "chapter-thumb",
    );
    await fs.writeFile(
      path.join(thumbnailsDirectory(configuration.media.dataDirectory), videoId, "current.json"),
      JSON.stringify({
        modifiedAt: now,
        sizeBytes: 10,
        version: thumbnailCacheVersion,
        revision,
        chapterStarts: [0],
      }),
    );
    const generated = await app.request(`/covers/videos/${videoId}?t=${revision}`, {
      headers: { cookie: cookie!, "x-profile-selection": selectionKey },
    });
    expect(generated.status).toBe(200);
    expect(await generated.text()).toBe("thumb");

    const chapterThumbnail = await app.request(
      `/covers/videos/${videoId}/chapters/0?t=${revision}`,
      { headers: { cookie: cookie!, "x-profile-selection": selectionKey } },
    );
    expect(chapterThumbnail.status).toBe(200);
    expect(await chapterThumbnail.text()).toBe("chapter-thumb");

    const videoDetail = await app.request(`/api/videos/${"b".repeat(24)}`, {
      headers: { cookie: cookie!, "x-profile-selection": selectionKey },
    });
    expect(videoDetail.status).toBe(200);
    expect(await videoDetail.json()).toMatchObject({
      video: {
        id: "b".repeat(24),
        title: "Video",
        chapters: [
          {
            title: "Introduction",
            startSeconds: 0,
            thumbnailUrl: expect.stringContaining(`/covers/videos/${"b".repeat(24)}/chapters/0?t=`),
          },
        ],
      },
      playlist: { id: "a".repeat(24), title: "Playlist" },
    });

    const player = await app.request(`/api/playback/${"b".repeat(24)}`, {
      method: "POST",
      headers: { cookie: cookie!, "x-profile-selection": selectionKey, origin: "http://localhost" },
    });
    expect(player.status).toBe(200);
    expect(await player.json()).toEqual({ kind: "direct", url: `/media/${"b".repeat(24)}` });
    expect(await context.database.connection("progress")).toEqual([]);

    const apiNotFound = await app.request("/api/does-not-exist", {
      headers: { cookie: cookie!, "x-profile-selection": selectionKey },
    });
    expect(apiNotFound.status).toBe(404);
    expect(await apiNotFound.json()).toEqual({ message: "Resource not found" });

    for (const libraryPath of ["/api/videos/not-an-id", `/api/videos/${"d".repeat(24)}`]) {
      expect(
        (
          await app.request(libraryPath, {
            headers: { cookie: cookie!, "x-profile-selection": selectionKey },
          })
        ).status,
      ).toBe(404);
    }

    const robots = await app.request("/robots.txt");
    expect(robots.status).toBe(200);
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");

    const faviconIco = await app.request("/favicon.ico");
    expect(faviconIco.status).toBe(200);
    expect(faviconIco.headers.get("content-type")).toContain("image/x-icon");

    const faviconSvg = await app.request("/favicon.svg");
    expect(faviconSvg.status).toBe(200);
    expect(faviconSvg.headers.get("content-type")).toContain("image/svg+xml");

    const manifest = await app.request("/manifest.webmanifest");
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("cache-control")).toBe("no-cache");

    for (const route of ["/", "/index.html"]) {
      const index = await app.request(route);
      expect(index.status).toBe(200);
      expect(index.headers.get("cache-control")).toBe("no-cache");
      expect(await index.text()).toBe("SPA");
    }
  });
});
