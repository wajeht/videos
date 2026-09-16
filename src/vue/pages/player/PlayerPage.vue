<script setup lang="ts">
import { computed, useTemplateRef } from "vue";

import { useVideoPlayer } from "@/composables/useVideoPlayer.js";
import PlayerPlaylistSidebar from "@/pages/player/partials/PlayerPlaylistSidebar.vue";
import PlayerVideoDetails from "@/pages/player/partials/PlayerVideoDetails.vue";
import PlayerVideoStage from "@/pages/player/partials/PlayerVideoStage.vue";

const stage = useTemplateRef<InstanceType<typeof PlayerVideoStage>>("stage");
const media = computed(() => stage.value?.video ?? null);
const player = useVideoPlayer(media);
</script>

<template>
  <main
    class="grid min-h-[calc(100vh-66px)] bg-canvas"
    :class="
      player.playlist.value
        ? 'grid-cols-[minmax(0,1fr)_390px] max-[1120px]:grid-cols-[minmax(0,1fr)_330px] max-[860px]:block'
        : 'grid-cols-1'
    "
  >
    <section class="min-w-0 px-[clamp(20px,3vw,50px)] pt-6 pb-10 max-[600px]:px-3">
      <div :class="player.playlist.value ? '' : 'mx-auto max-w-[1180px]'">
        <PlayerVideoStage
          ref="stage"
          :ended="player.ended.value"
          :error="player.error.value"
          :loading="player.loading.value"
          :next-video="player.nextVideo.value"
          :playback="player.playback.value"
          :poster="player.posterUrl.value"
          :retrying="player.retrying.value"
          @ended="player.markComplete"
          @loaded-metadata="player.applyResume"
          @pause="player.onPause"
          @retry="player.retryConversion"
          @time-update="player.onTimeUpdate"
        />
        <PlayerVideoDetails
          :current-time="player.currentTime.value"
          :video="player.video.value"
          :resetting="player.resetting.value"
          :regenerating="player.regenerating.value"
          @reset="player.resetProgress"
          @regenerate="player.regenerateThumbnail"
          @seek="player.seekToChapter"
        />
      </div>
    </section>
    <PlayerPlaylistSidebar
      :active-video-id="player.video.value?.id"
      :autoplay-next="player.autoplayNext.value"
      :playlist="player.playlist.value"
      :resetting="player.resettingPlaylist.value"
      @autoplay-change="player.setAutoplayNext"
      @reset="player.resetPlaylistProgress"
    />
  </main>
</template>
