<script setup lang="ts">
import type { PlaylistVideoDto } from "@/api.js";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import VideoCoverPlaceholder from "@/components/VideoCoverPlaceholder.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import { playerLocation } from "@/router.js";
import { timestampText } from "@/utils.js";

defineProps<{ video: PlaylistVideoDto; active: boolean }>();
const prefetch = useRoutePrefetch();
</script>

<template>
  <IntentRouterLink
    :to="playerLocation(video.id, video.playlistId)"
    :prefetch="() => prefetch.video(video.id)"
    class="grid min-h-14 grid-cols-[88px_minmax(0,1fr)_auto] items-center border-b border-line px-3 py-2 transition-colors last:border-b-0 hover:bg-mist"
    :class="active && 'bg-mist shadow-[inset_4px_0_var(--color-link)]'"
  >
    <span class="relative aspect-video overflow-hidden bg-mist">
      <img
        v-if="video.coverUrl"
        class="h-full w-full object-cover"
        :src="video.coverUrl"
        alt=""
        loading="lazy"
      />
      <VideoCoverPlaceholder v-else class="h-full w-full" :title="video.title" compact />
      <span
        class="absolute right-0.5 bottom-0.5 border border-line bg-surface/95 px-1 py-0.5 text-xs leading-none whitespace-nowrap text-ink tabular-nums"
      >
        {{ timestampText(video.durationSeconds) }}
      </span>
    </span>
    <span class="ml-2 line-clamp-2 min-w-0 text-sm leading-snug wrap-anywhere">{{
      video.title
    }}</span>
    <span
      v-if="video.completed || video.positionSeconds > 0"
      class="ml-2 text-right text-sm whitespace-nowrap text-muted tabular-nums"
    >
      <span v-if="video.completed" class="text-ink" aria-label="Completed">✓</span>
      <span v-else>{{ video.progressPercent }}%</span>
    </span>
  </IntentRouterLink>
</template>
