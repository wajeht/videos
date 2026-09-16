<script setup lang="ts">
import { useTemplateRef } from "vue";

import type { PlaybackResult, VideoDto } from "@/api.js";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import AppButton from "@/components/ui/AppButton.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import { playerLocation } from "@/router.js";

defineProps<{
  ended: boolean;
  error: string;
  loading: boolean;
  nextVideo?: VideoDto;
  playback: PlaybackResult | null;
  poster?: string;
  retrying: boolean;
}>();
const emit = defineEmits<{
  ended: [];
  loadedMetadata: [];
  pause: [];
  retry: [];
  timeUpdate: [];
}>();
const video = useTemplateRef<HTMLVideoElement>("video");
const prefetch = useRoutePrefetch();
defineExpose({ video });
</script>

<template>
  <div
    class="relative mx-auto mb-[26px] grid aspect-video max-h-[calc(100vh-260px)] w-full place-items-center overflow-hidden rounded-[6px] border border-white/10 bg-black shadow-[0_28px_80px_rgb(0_0_0_/_38%)]"
  >
    <video
      ref="video"
      class="absolute inset-0 h-full w-full object-contain"
      controls
      playsinline
      :poster="poster"
      @loadedmetadata="emit('loadedMetadata')"
      @timeupdate="emit('timeUpdate')"
      @pause="emit('pause')"
      @ended="emit('ended')"
    />
    <div
      v-if="loading"
      class="absolute inset-0 grid place-items-center content-center bg-pine-deep p-8 text-center"
      role="status"
    >
      <div
        class="h-10 w-10 animate-spin rounded-full border-[3px] border-white/20 border-t-white"
      />
      <p class="mt-4 text-sm text-white/58">Preparing video…</p>
    </div>
    <div
      v-else-if="playback?.kind === 'converting'"
      class="absolute inset-0 grid place-items-center content-center bg-pine-deep p-8 text-center"
      role="status"
    >
      <h2 class="font-display text-3xl">Preparing this video</h2>
      <p class="mt-2 text-sm text-white/58">{{ playback.progress }}% complete.</p>
    </div>
    <div
      v-else-if="error"
      class="absolute inset-0 grid place-items-center content-center bg-pine-deep p-8 text-center"
    >
      <h2 class="font-display text-3xl">Video unavailable</h2>
      <p class="mt-2 text-sm text-white/58">{{ error }}</p>
      <AppButton
        v-if="playback?.kind === 'error'"
        class="mt-5"
        variant="inverse"
        :loading="retrying"
        @click="emit('retry')"
        >Try again</AppButton
      >
    </div>
    <div
      v-if="ended"
      class="absolute inset-0 z-[3] grid place-items-center content-center bg-[rgb(18_22_28_/_92%)] p-8 text-center backdrop-blur-lg"
    >
      <span class="text-xs font-extrabold text-belt-light">Video complete</span>
      <h2 class="mt-4 font-display text-3xl">
        {{ nextVideo ? "Ready for the next video?" : "Finished." }}
      </h2>
      <AppButton
        v-if="nextVideo"
        :as="IntentRouterLink"
        :to="playerLocation(nextVideo.id, nextVideo.playlistId)"
        :prefetch="() => prefetch.video(nextVideo!.id)"
        class="mt-5"
        variant="inverse"
        >Next video →</AppButton
      >
    </div>
  </div>
</template>
