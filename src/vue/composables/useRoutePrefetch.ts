import { useQueryClient } from "@tanstack/vue-query";

import { useDestinationPrefetch } from "@/composables/useDestinationPrefetch.js";
import { profilesQueryOptions, scanStatusQueryOptions, settingsQueryOptions } from "@/queries.js";
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

  async function profiles(isAdmin: boolean): Promise<void> {
    if (isAdmin) await queryClient.prefetchQuery(profilesQueryOptions());
  }

  return {
    home: () => Promise.all([prefetchLibrary({}, "home"), loadHomePage()]),
    videos: () => Promise.all([prefetchLibrary({}, "videos"), loadVideosPage()]),
    author: (authorName: string) =>
      Promise.all([prefetchLibrary({ author: [authorName] }, "author"), loadAuthorPage()]),
    video: (videoId: string) => Promise.all([prefetchVideo(videoId), loadPlayerPage()]),
    settingsProfiles: async (isAdmin: boolean): Promise<void> => {
      await Promise.all([
        settings(),
        profiles(isAdmin),
        import("@/pages/settings/ProfilesPage.vue"),
      ]);
    },
    settingsAccess: async (): Promise<void> => {
      await Promise.all([settings(), loadSettingsAccessPage()]);
    },
    settingsLibrary: async (): Promise<void> => {
      await Promise.all([
        settings(),
        queryClient.prefetchQuery(scanStatusQueryOptions()),
        loadSettingsLibraryPage(),
      ]);
    },
  };
}
