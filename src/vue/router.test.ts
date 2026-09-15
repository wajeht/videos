// @vitest-environment happy-dom

import type { RouteLocationNormalized } from "vue-router";
import { describe, expect, it } from "vitest";

import { notFoundLocation, playerLocation, router } from "./router.js";

function normalizedLocation(path: string): RouteLocationNormalized {
  const location = router.resolve(path);
  if (location.name === null) throw new Error(`Expected ${path} to resolve to a named route`);
  return { ...location, name: location.name };
}

describe("router error pages", () => {
  it("uses Videos as the primary browse route without a Library alias", () => {
    const videos = router.resolve("/videos");
    const legacyLibrary = router.resolve("/library");

    expect(videos.name).toBe("videos");
    expect(videos.meta.navigation).toBe("videos");
    expect(videos.meta.title).toBe("All videos");
    expect(legacyLibrary.name).toBe("not-found");
    expect(legacyLibrary.redirectedFrom).toBeUndefined();
  });

  it("provides author pages under the canonical author vocabulary", () => {
    const author = router.resolve("/authors/Jane%20Smith");

    expect(author.name).toBe("author");
    expect(author.params.authorName).toBe("Jane Smith");
    expect(author.meta.navigation).toBe("videos");
    expect(author.meta.title).toBe("Author");
  });

  it("does not expose a separate playlist details route", () => {
    const route = router.resolve(`/playlists/${"a".repeat(24)}`);

    expect(route.name).toBe("not-found");
    expect(route.redirectedFrom).toBeUndefined();
  });

  it("attaches playlist context to the player as a list query", () => {
    const videoId = "a".repeat(24);
    const playlistId = "b".repeat(24);
    const withList = router.resolve(playerLocation(videoId, playlistId));
    const withoutList = router.resolve(playerLocation(videoId));

    expect(withList.name).toBe("player");
    expect(withList.params.videoId).toBe(videoId);
    expect(withList.query.list).toBe(playlistId);
    expect(withoutList.path).toBe(`/videos/${videoId}`);
    expect(withoutList.query).toEqual({});
  });

  it("provides separate Library and Access settings routes", () => {
    const library = router.resolve("/settings/library");
    const access = router.resolve("/settings/access");

    expect(library.name).toBe("settings-library");
    expect(library.meta.navigation).toBe("settings");
    expect(library.meta.title).toBe("Library settings");
    expect(access.name).toBe("settings-access");
    expect(access.meta.navigation).toBe("settings");
    expect(access.meta.title).toBe("Access settings");
  });

  it("resolves profile creation and editing under the Profiles settings section", () => {
    const edit = router.resolve("/settings/profiles/profile-id/edit");
    expect(edit.name).toBe("settings-profile-edit");
    expect(edit.params.profileId).toBe("profile-id");
    expect(edit.meta.navigation).toBe("settings");
    expect(edit.meta.title).toBe("Edit profile");
    expect(edit.matched.some((record) => record.path === "/settings/profiles")).toBe(true);
    expect(router.resolve("/settings/profiles/new").name).toBe("settings-profile-new");
    expect(router.resolve("/settings/profiles").name).toBe("settings-profiles");
  });

  it("does not retain the old combined settings route", () => {
    const route = router.resolve("/settings");

    expect(route.name).toBe("not-found");
    expect(route.redirectedFrom).toBeUndefined();
  });

  it("resolves unknown frontend URLs to the not-found page", () => {
    const route = router.resolve("/missing/video/page");

    expect(route.name).toBe("not-found");
    expect(route.meta.title).toBe("Page not found");
    expect(route.redirectedFrom).toBeUndefined();
  });

  it("keeps a missing resource URL while matching the not-found page", () => {
    const route = router.resolve(notFoundLocation("/videos/missing"));

    expect(route.path).toBe("/videos/missing");
    expect(route.name).toBe("not-found");
  });
});

describe("router scrolling", () => {
  it("restores the saved position during browser history navigation", async () => {
    const scrollBehavior = router.options.scrollBehavior;
    const savedPosition = { left: 0, top: 320 };

    expect(scrollBehavior).toBeTypeOf("function");
    expect(
      await scrollBehavior?.(normalizedLocation("/videos"), normalizedLocation("/"), savedPosition),
    ).toEqual(savedPosition);
  });

  it("keeps scroll for query-only navigation and resets it for a new page", async () => {
    const scrollBehavior = router.options.scrollBehavior;

    expect(
      await scrollBehavior?.(
        normalizedLocation("/videos?page=2"),
        normalizedLocation("/videos?page=1"),
        null,
      ),
    ).toBe(false);
    expect(
      await scrollBehavior?.(normalizedLocation("/videos"), normalizedLocation("/"), null),
    ).toEqual({ top: 0 });
  });
});
