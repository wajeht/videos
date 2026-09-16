<script setup lang="ts">
import { computed, useId } from "vue";

import type { PlaylistDetailDto } from "@/api.js";
import VideoRow from "@/components/VideoRow.vue";
import PlayerProgressMenu from "@/pages/player/partials/PlayerProgressMenu.vue";

const props = defineProps<{
  activeVideoId?: string;
  autoplayNext: boolean;
  playlist: PlaylistDetailDto | null;
  resetting: boolean;
}>();
defineEmits<{ autoplayChange: [enabled: boolean]; reset: [] }>();
const videos = computed(() => props.playlist?.sections.flatMap((section) => section.videos) ?? []);
const currentIndex = computed(() =>
  videos.value.findIndex((video) => video.id === props.activeVideoId),
);
const titleId = `playlist-title-${useId()}`;
</script>

<template>
  <aside
    v-if="playlist"
    class="sticky top-0 flex h-[calc(100vh-66px)] flex-col border-l border-line bg-porcelain max-[860px]:static max-[860px]:mx-[clamp(20px,3vw,50px)] max-[860px]:mb-10 max-[860px]:h-auto max-[860px]:w-auto max-[860px]:overflow-hidden max-[860px]:border max-[860px]:border-line max-[600px]:mx-3"
    :aria-labelledby="titleId"
  >
    <header class="flex items-start justify-between border-b border-line px-5 py-5">
      <div class="min-w-0">
        <p>Playlist</p>
        <h2 :id="titleId" class="mt-2">{{ playlist.title }}</h2>
        <p class="mt-1">Video {{ currentIndex + 1 }} of {{ videos.length }}</p>
      </div>
      <PlayerProgressMenu
        label="Playlist actions"
        autoplay-label="Autoplay next video"
        :autoplay-enabled="autoplayNext"
        reset-label="Reset playlist progress"
        :resetting="resetting"
        @autoplay-change="$emit('autoplayChange', $event)"
        @reset="$emit('reset')"
      />
    </header>
    <div class="flex-1 overflow-y-auto max-[860px]:overflow-visible">
      <section v-for="section in playlist.sections" :key="section.id ?? 'direct'">
        <h3 class="sticky top-0 z-[2] border-y border-line bg-mist px-4 py-3">
          {{ section.title }}
        </h3>
        <VideoRow
          v-for="(video, index) in section.videos"
          :key="video.id"
          :video="video"
          :index="index"
          :active="video.id === activeVideoId"
          sidebar
        />
      </section>
    </div>
  </aside>
</template>
