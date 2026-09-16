<script setup lang="ts">
import type { VideoDto } from "@/api.js";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import VideoCoverPlaceholder from "@/components/VideoCoverPlaceholder.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import { playerLocation } from "@/router.js";
import { durationText } from "@/utils.js";

withDefaults(
  defineProps<{ video: VideoDto; index: number; active?: boolean; sidebar?: boolean }>(),
  {
    active: false,
    sidebar: false,
  },
);
const prefetch = useRoutePrefetch();
</script>

<template>
  <IntentRouterLink
    :to="playerLocation(video.id, video.playlistId)"
    :prefetch="() => prefetch.video(video.id)"
    class="grid items-center border-b border-line py-2 transition-colors last:border-b-0 hover:bg-mist"
    :class="[
      sidebar
        ? 'min-h-14 grid-cols-[72px_minmax(0,1fr)_30px] gap-2 px-3'
        : 'min-h-[62px] grid-cols-[42px_minmax(0,1fr)_auto_42px] gap-3 px-4 max-[600px]:grid-cols-[31px_minmax(0,1fr)_32px] max-[600px]:gap-[7px] max-[600px]:px-[10px]',
      active && 'bg-mist shadow-[inset_4px_0_var(--color-link)]',
    ]"
  >
    <span v-if="sidebar" class="relative aspect-video w-[72px] overflow-hidden bg-mist">
      <img
        v-if="video.coverUrl"
        class="h-full w-full object-cover"
        :src="video.coverUrl"
        alt=""
        loading="lazy"
      />
      <VideoCoverPlaceholder v-else class="h-full w-full" :title="video.title" compact />
      <span class="absolute right-1 bottom-1 bg-black/80 px-1 py-0.5 text-white">
        {{ durationText(video.durationSeconds) }}
      </span>
    </span>
    <span v-else>
      {{ String(index + 1).padStart(2, "0") }}
    </span>
    <span class="min-w-0 overflow-hidden text-ellipsis">
      {{ video.title }}
    </span>
    <span v-if="!sidebar" class="max-[600px]:hidden">
      {{ durationText(video.durationSeconds) }}
    </span>
    <span
      class="grid h-[27px] w-[27px] place-items-center justify-self-end border"
      :class="video.completed ? 'border-line bg-pine text-ink' : 'border-line text-muted'"
    >
      <span v-if="video.completed" aria-label="Completed">✓</span>
      <span v-else-if="video.positionSeconds > 0">{{ video.progressPercent }}%</span>
      <span v-else aria-hidden="true">›</span>
    </span>
  </IntentRouterLink>
</template>
