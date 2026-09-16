<script setup lang="ts">
import { computed } from "vue";

import type { VideoDto } from "@/api.js";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import VideoCoverPlaceholder from "@/components/VideoCoverPlaceholder.vue";
import HighlightedText from "@/components/ui/HighlightedText.vue";
import ProgressBar from "@/components/ui/ProgressBar.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import { playerLocation } from "@/router.js";
import { durationText } from "@/utils.js";
import { matchVideoSearch, type TextRange } from "../../library/video-search.js";

const props = defineProps<{
  activeIndex: number;
  error: string;
  loading: boolean;
  query: string;
  started: boolean;
  videos: VideoDto[];
}>();
const emit = defineEmits<{ activate: [index: number]; close: [] }>();
const prefetch = useRoutePrefetch();

function videoContext(video: VideoDto): string {
  return [
    ...new Set([...video.authors, ...(video.playlistTitle ? [video.playlistTitle] : [])]),
  ].join(" · ");
}

interface ContextPart {
  text: string;
  ranges: TextRange[];
}

const results = computed(() =>
  props.videos.map((video) => {
    const match = matchVideoSearch(video, props.query);
    const titleRanges = match?.matches.find((entry) => entry.field === "title")?.ranges ?? [];
    const visibleContext = [
      ...new Set([...video.authors, ...(video.playlistTitle ? [video.playlistTitle] : [])]),
    ];
    const primaryMatch = match?.matches[0];
    let contextParts: ContextPart[] = visibleContext.map((text) => ({
      text,
      ranges: match?.matches.find((entry) => entry.value === text)?.ranges ?? [],
    }));
    if (primaryMatch?.field === "tag") {
      contextParts = [
        {
          text: `Tag: ${primaryMatch.value}`,
          ranges: primaryMatch.ranges.map((range) => ({
            start: range.start + 5,
            end: range.end + 5,
          })),
        },
      ];
    } else if (primaryMatch?.field === "description") {
      contextParts = [{ text: primaryMatch.value, ranges: primaryMatch.ranges }];
    }
    return { video, titleRanges, contextParts };
  }),
);

function videoOptionLabel(video: VideoDto): string {
  let progress = "";
  if (video.completed) progress = "Completed";
  else if (video.progressPercent > 0) progress = `${video.progressPercent}% watched`;
  return [video.title, videoContext(video), durationText(video.durationSeconds), progress]
    .filter(Boolean)
    .join(", ");
}
</script>

<template>
  <div
    id="video-search-results"
    class="max-h-[min(480px,60vh)] overflow-y-auto px-2 py-2"
    aria-live="polite"
  >
    <div v-if="!started" class="grid min-h-28 place-content-center px-6 text-center">
      <p>Search your library</p>
      <p class="mt-1">Find videos by title, author, playlist, or tag.</p>
    </div>
    <p v-else-if="loading" class="px-3 py-3">Searching videos…</p>
    <p v-else-if="error" class="px-3 py-3 text-clay-ink">{{ error }}</p>
    <p v-else-if="!videos.length" class="px-3 py-3">No matching videos</p>
    <ul v-else class="list-none p-0" aria-label="Video search results" role="listbox">
      <li v-for="({ video, titleRanges, contextParts }, index) in results" :key="video.id">
        <IntentRouterLink
          :id="`video-search-result-${video.id}`"
          :to="playerLocation(video.id, video.playlistId)"
          :prefetch="() => prefetch.video(video.id)"
          class="grid min-h-[72px] grid-cols-[36px_96px_minmax(0,1fr)] items-center gap-x-3 border-l-4 px-3 py-2.5 focus-visible:outline-none max-[600px]:grid-cols-[28px_72px_minmax(0,1fr)] max-[600px]:gap-x-2 max-[600px]:px-2"
          :class="
            index === activeIndex ? 'border-link bg-mist' : 'border-transparent hover:bg-mist'
          "
          role="option"
          :aria-label="videoOptionLabel(video)"
          :aria-selected="index === activeIndex"
          @click="emit('close')"
          @pointerenter="emit('activate', index)"
        >
          <span class="text-muted">
            {{ String(index + 1).padStart(2, "0") }}
          </span>
          <span class="relative aspect-video w-24 overflow-hidden bg-mist max-[600px]:w-[72px]">
            <img
              v-if="video.coverUrl"
              :src="video.coverUrl"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
            />
            <VideoCoverPlaceholder v-else class="h-full w-full" compact :title="video.title" />
            <span class="absolute right-1 bottom-1 bg-black/80 px-1 py-0.5 text-white">
              {{ durationText(video.durationSeconds) }}
            </span>
            <ProgressBar
              v-if="video.progressPercent > 0"
              class="absolute right-0 bottom-0 left-0"
              :value="video.progressPercent"
              compact
            />
          </span>
          <span class="min-w-0">
            <span class="block truncate">
              <HighlightedText :text="video.title" :ranges="titleRanges" />
            </span>
            <span v-if="contextParts.length" class="mt-0.5 block truncate text-muted">
              <template
                v-for="(part, partIndex) in contextParts"
                :key="`${part.text}-${partIndex}`"
              >
                <span v-if="partIndex"> · </span>
                <HighlightedText :text="part.text" :ranges="part.ranges" />
              </template>
            </span>
          </span>
        </IntentRouterLink>
      </li>
    </ul>
  </div>
</template>
