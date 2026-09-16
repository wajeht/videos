<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import IntentRouterLink from "@/components/IntentRouterLink.vue";
import VideoSearchPalette from "@/components/VideoSearchPalette.vue";
import AppLogo from "@/components/ui/AppLogo.vue";
import { useMediaQuery } from "@/composables/useMediaQuery.js";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";

const route = useRoute();
const prefetch = useRoutePrefetch();
const desktopSearchEnabled = useMediaQuery("(min-width: 601px)");
const activeNavigation = computed(() => route.meta.navigation);
const isPlayer = computed(() => route.meta.shell === "player");
</script>

<template>
  <div
    class="min-h-screen max-[600px]:pb-[calc(68px+env(safe-area-inset-bottom))]"
    :class="isPlayer ? 'max-[600px]:bg-pine-deep' : ''"
  >
    <header
      class="z-40 flex h-[calc(66px+env(safe-area-inset-top))] items-center justify-between border-b border-line px-[4vw] pt-[env(safe-area-inset-top)] text-ink max-[860px]:px-[22px]"
      :class="isPlayer ? 'relative bg-surface' : 'sticky top-0 bg-surface'"
    >
      <IntentRouterLink
        to="/"
        :prefetch="prefetch.home"
        class="flex items-center gap-3 font-display text-2xl font-extrabold"
        aria-label="Videos home"
      >
        <AppLogo />
      </IntentRouterLink>
      <nav class="flex items-center gap-6 max-[600px]:hidden" aria-label="Main navigation">
        <IntentRouterLink
          to="/"
          :prefetch="prefetch.home"
          class="border-b-2 px-0 py-2 text-sm font-semibold"
          :class="
            activeNavigation === 'home'
              ? 'border-ink text-ink'
              : 'border-transparent text-muted hover:text-ink'
          "
        >
          Home
        </IntentRouterLink>
        <IntentRouterLink
          to="/videos"
          :prefetch="prefetch.videos"
          class="border-b-2 px-0 py-2 text-sm font-semibold"
          :class="
            activeNavigation === 'videos'
              ? 'border-ink text-ink'
              : 'border-transparent text-muted hover:text-ink'
          "
        >
          Videos
        </IntentRouterLink>
        <IntentRouterLink
          to="/settings/library"
          :prefetch="prefetch.settingsLibrary"
          class="border-b-2 px-0 py-2 text-sm font-semibold"
          :class="
            activeNavigation === 'settings'
              ? 'border-ink text-ink'
              : 'border-transparent text-muted hover:text-ink'
          "
        >
          Settings
        </IntentRouterLink>
      </nav>
    </header>
    <VideoSearchPalette v-if="desktopSearchEnabled" />
    <slot />
    <nav
      class="fixed right-0 bottom-0 left-0 z-50 hidden border-t border-line bg-surface px-3 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))] text-ink max-[600px]:grid max-[600px]:grid-cols-3"
      aria-label="Mobile navigation"
    >
      <IntentRouterLink
        to="/"
        :prefetch="prefetch.home"
        class="relative flex min-h-[56px] items-center justify-center rounded-[8px] text-[.8rem] font-semibold"
        :class="activeNavigation === 'home' ? 'text-ink' : 'text-muted'"
        :aria-current="activeNavigation === 'home' ? 'page' : undefined"
      >
        <span
          class="absolute top-0 h-[3px] w-8 rounded-full bg-ink transition-opacity"
          :class="activeNavigation === 'home' ? 'opacity-100' : 'opacity-0'"
          aria-hidden="true"
        />
        Home
      </IntentRouterLink>
      <IntentRouterLink
        to="/videos"
        :prefetch="prefetch.videos"
        class="relative flex min-h-[56px] items-center justify-center rounded-[8px] text-[.8rem] font-semibold"
        :class="activeNavigation === 'videos' ? 'text-ink' : 'text-muted'"
        :aria-current="activeNavigation === 'videos' ? 'page' : undefined"
      >
        <span
          class="absolute top-0 h-[3px] w-8 rounded-full bg-ink transition-opacity"
          :class="activeNavigation === 'videos' ? 'opacity-100' : 'opacity-0'"
          aria-hidden="true"
        />
        Videos
      </IntentRouterLink>
      <IntentRouterLink
        to="/settings/library"
        :prefetch="prefetch.settingsLibrary"
        class="relative flex min-h-[56px] items-center justify-center rounded-[8px] text-[.8rem] font-semibold"
        :class="activeNavigation === 'settings' ? 'text-ink' : 'text-muted'"
        :aria-current="activeNavigation === 'settings' ? 'page' : undefined"
      >
        <span
          class="absolute top-0 h-[3px] w-8 rounded-full bg-ink transition-opacity"
          :class="activeNavigation === 'settings' ? 'opacity-100' : 'opacity-0'"
          aria-hidden="true"
        />
        Settings
      </IntentRouterLink>
    </nav>
  </div>
</template>
