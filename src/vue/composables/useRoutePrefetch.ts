import { useQueryClient } from "@tanstack/vue-query";

import { useDestinationPrefetch } from "@/composables/useDestinationPrefetch.js";
import { settingsQueryOptions } from "@/queries.js";
import {
  loadAuthorPage,
  loadHomePage,
  loadVideosPage,
  loadPlayerPage,
  loadSettingsAccessPage,
  loadSettingsLibraryPage,
} from "@/router.js";

export function useRoutePrefetch() {
  const queryClient = useQueryClient();
  const { prefetchLibrary, prefetchVideo } = useDestinationPrefetch();
  const settings = () => queryClient.prefetchQuery(settingsQueryOptions());

  return {
    home: () => Promise.all([prefetchLibrary({}, "home"), loadHomePage()]),
    videos: () => Promise.all([prefetchLibrary({}, "videos"), loadVideosPage()]),
    author: (authorName: string) =>
      Promise.all([prefetchLibrary({ author: [authorName] }, "author"), loadAuthorPage()]),
    video: (videoId: string) => Promise.all([prefetchVideo(videoId), loadPlayerPage()]),
    settingsProfiles: () => Promise.all([settings(), import("@/pages/settings/ProfilesPage.vue")]),
    settingsAccess: () => Promise.all([settings(), loadSettingsAccessPage()]),
    settingsLibrary: () => Promise.all([settings(), loadSettingsLibraryPage()]),
  };
}
