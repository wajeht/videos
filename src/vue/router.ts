import { createRouter, createWebHistory, type RouteLocationRaw } from "vue-router";

import { clearFrontendError, showFrontendError } from "@/frontend-error.js";
import { setPageTitle } from "@/utils.js";

declare module "vue-router" {
  interface RouteMeta {
    navigation?: "home" | "videos" | "settings";
    shell?: "player";
    title?: string;
  }
}

export const loadHomePage = () => import("@/pages/home/HomePage.vue");
export const loadVideosPage = () => import("@/pages/library/LibraryPage.vue");
export const loadAuthorPage = () => import("@/pages/author/AuthorPage.vue");
export const loadPlayerPage = () => import("@/pages/player/PlayerPage.vue");
export const loadSettingsLibraryPage = () => import("@/pages/settings/LibraryPage.vue");
export const loadSettingsAccessPage = () => import("@/pages/settings/AccessPage.vue");

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: loadHomePage, meta: { navigation: "home" } },
    {
      path: "/videos",
      name: "videos",
      component: loadVideosPage,
      meta: { navigation: "videos", title: "All videos" },
    },
    {
      path: "/authors/:authorName",
      name: "author",
      component: loadAuthorPage,
      meta: { navigation: "videos", title: "Author" },
    },
    {
      path: "/videos/:videoId",
      name: "player",
      component: loadPlayerPage,
      meta: { navigation: "videos", shell: "player", title: "Video" },
    },
    {
      path: "/settings/library",
      name: "settings-library",
      component: loadSettingsLibraryPage,
      meta: { navigation: "settings", title: "Library settings" },
    },
    {
      path: "/settings/profiles",
      meta: { navigation: "settings", title: "Profiles" },
      children: [
        {
          path: "",
          name: "settings-profiles",
          component: () => import("@/pages/settings/ProfilesPage.vue"),
        },
        {
          path: "new",
          name: "settings-profile-new",
          component: () => import("@/pages/settings/ProfilesPage.vue"),
          meta: { title: "Add profile" },
        },
        {
          path: ":profileId/edit",
          name: "settings-profile-edit",
          component: () => import("@/pages/settings/ProfilesPage.vue"),
          meta: { title: "Edit profile" },
        },
      ],
    },
    {
      path: "/settings/access",
      name: "settings-access",
      component: loadSettingsAccessPage,
      meta: { navigation: "settings", title: "Access settings" },
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/pages/NotFoundPage.vue"),
      meta: { title: "Page not found" },
    },
  ],
  scrollBehavior: (to, from, savedPosition) => {
    if (savedPosition) return savedPosition;
    return to.path === from.path ? false : { top: 0 };
  },
});

export function notFoundLocation(path: string): RouteLocationRaw {
  return { name: "not-found", params: { pathMatch: path.split("/").filter(Boolean) } };
}

export function playerLocation(videoId: string, list?: string | null): RouteLocationRaw {
  return {
    name: "player",
    params: { videoId },
    query: list ? { list } : {},
  };
}

router.afterEach((route, _from, failure) => {
  if (failure) return;
  clearFrontendError();
  setPageTitle(route.meta.title);
});
router.onError((error, route) => {
  showFrontendError(error, route.fullPath, "route navigation");
});
