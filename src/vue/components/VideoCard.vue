<script setup lang="ts">
import { computed, type DeepReadonly } from "vue";

import type { LibraryDto } from "@/api.js";
import AuthorLinks from "@/components/AuthorLinks.vue";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import VideoCoverPlaceholder from "@/components/VideoCoverPlaceholder.vue";
import ProgressBar from "@/components/ui/ProgressBar.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import { playerLocation } from "@/router.js";
import { durationText } from "@/utils.js";

const props = defineProps<{ video: DeepReadonly<LibraryDto["videos"][number]> }>();
const prefetch = useRoutePrefetch();
const to = computed(() => playerLocation(props.video.id, props.video.playlistId));
</script>

<template>
  <article class="group min-w-0">
    <IntentRouterLink
      :to="to"
      :prefetch="() => prefetch.video(video.id)"
      class="relative block aspect-video overflow-hidden bg-mist ring-1 ring-black/5"
      :aria-label="`Play ${video.title}`"
    >
      <img
        v-if="video.coverUrl"
        class="h-full w-full object-cover transition-transform duration-[400ms] group-hover:scale-[1.025] motion-reduce:transition-none"
        :src="video.coverUrl"
        :alt="`${video.title} cover`"
        loading="lazy"
      />
      <VideoCoverPlaceholder v-else class="h-full w-full" :title="video.title" />
      <span class="absolute right-2 bottom-2 bg-black/80 px-1.5 py-0.5 text-white">
        {{ durationText(video.durationSeconds) }}
      </span>
      <ProgressBar
        v-if="video.progressPercent > 0"
        class="absolute right-0 bottom-0 left-0"
        :value="video.progressPercent"
        label="Video progress"
        compact
      />
    </IntentRouterLink>
    <h3 class="mt-3 line-clamp-2">
      <IntentRouterLink :to="to" :prefetch="() => prefetch.video(video.id)">
        {{ video.title }}
      </IntentRouterLink>
    </h3>
    <AuthorLinks v-if="video.authors.length" class="mt-1 block truncate" :authors="video.authors" />
    <p v-if="video.playlistId" class="mt-1 truncate">
      {{ video.playlistTitle }}
    </p>
  </article>
</template>
