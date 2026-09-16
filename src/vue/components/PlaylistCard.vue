<script setup lang="ts">
import { computed, type DeepReadonly } from "vue";

import type { LibraryDto } from "@/api.js";
import AuthorLinks from "@/components/AuthorLinks.vue";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import VideoCoverPlaceholder from "@/components/VideoCoverPlaceholder.vue";
import ProgressBar from "@/components/ui/ProgressBar.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import { playerLocation } from "@/router.js";
import { countText } from "@/utils.js";

const props = defineProps<{ playlist: DeepReadonly<LibraryDto["playlists"][number]> }>();
const prefetch = useRoutePrefetch();
const to = computed(() => playerLocation(props.playlist.nextVideoId, props.playlist.id));
</script>

<template>
  <article class="group min-w-0">
    <IntentRouterLink
      :to="to"
      :prefetch="() => prefetch.video(playlist.nextVideoId)"
      class="relative block aspect-video overflow-hidden rounded-[8px] bg-mist ring-1 ring-black/5"
      :aria-label="`Open ${playlist.title}`"
    >
      <img
        v-if="playlist.coverUrl"
        class="h-full w-full object-cover transition-transform duration-[400ms] group-hover:scale-[1.025] motion-reduce:transition-none"
        :src="playlist.coverUrl"
        :alt="`${playlist.title} cover`"
        loading="lazy"
      />
      <VideoCoverPlaceholder v-else class="h-full w-full" :title="playlist.title" />
      <span
        class="absolute right-2 bottom-2 rounded bg-black/80 px-2 py-1 text-xs font-medium text-white"
      >
        {{ countText(playlist.videoCount, "video") }}
      </span>
      <ProgressBar
        v-if="playlist.progressPercent > 0"
        class="absolute right-0 bottom-0 left-0"
        :value="playlist.progressPercent"
        label="Playlist progress"
        compact
      />
    </IntentRouterLink>
    <h3 class="mt-3 line-clamp-2 text-[.95rem] leading-[1.3] font-semibold tracking-[-.01em]">
      <IntentRouterLink
        :to="to"
        :prefetch="() => prefetch.video(playlist.nextVideoId)"
        class="hover:text-ink"
      >
        {{ playlist.title }}
      </IntentRouterLink>
    </h3>
    <AuthorLinks
      v-if="playlist.authors.length"
      class="mt-1 block truncate text-[.72rem] text-muted"
      :authors="playlist.authors"
    />
  </article>
</template>
