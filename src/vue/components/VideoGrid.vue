<script setup lang="ts">
import type { DeepReadonly } from "vue";

import type { LibraryDto } from "@/api.js";
import VideoCard from "@/components/VideoCard.vue";

defineProps<{ videos: DeepReadonly<LibraryDto["videos"]>; loading?: boolean }>();
</script>

<template>
  <div
    v-if="loading"
    class="grid grid-cols-4 gap-[clamp(18px,2vw,30px)] max-[1120px]:grid-cols-3 max-[860px]:grid-cols-2 max-[600px]:grid-cols-1"
    aria-label="Loading videos"
    role="status"
  >
    <div v-for="index in 4" :key="index" class="aspect-video animate-pulse bg-mist" />
  </div>
  <div
    v-else
    class="grid grid-cols-4 gap-x-[clamp(18px,2vw,30px)] gap-y-8 max-[1120px]:grid-cols-3 max-[860px]:grid-cols-2 max-[600px]:grid-cols-1"
  >
    <VideoCard v-for="video in videos" :key="video.id" :video="video" />
  </div>
</template>
