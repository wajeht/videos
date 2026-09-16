<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from "vue";

import type { VideoDetailDto } from "@/api.js";
import AuthorLinks from "@/components/AuthorLinks.vue";
import ChapterList from "@/components/ChapterList.vue";
import AppButton from "@/components/ui/AppButton.vue";
import PlayerProgressMenu from "@/pages/player/partials/PlayerProgressMenu.vue";

const props = defineProps<{
  currentTime: number;
  video: VideoDetailDto | null;
  resetting: boolean;
  regenerating?: boolean;
}>();
defineEmits<{ reset: []; regenerate: []; seek: [startSeconds: number] }>();

const expanded = shallowRef(false);
const descriptionTruncated = shallowRef(false);
const description = useTemplateRef<HTMLParagraphElement>("description");
const detailsId = `video-details-${useId()}`;
const hiddenChapterCount = computed(() => Math.max((props.video?.chapters.length ?? 0) - 3, 0));
const expandable = computed(() => descriptionTruncated.value || hiddenChapterCount.value > 0);
const disclosureLabel = computed(() => {
  if (expanded.value) return "Show fewer";
  if (hiddenChapterCount.value === 0) return "Show more";
  return `Show ${hiddenChapterCount.value} more chapter${hiddenChapterCount.value === 1 ? "" : "s"}`;
});

let descriptionObserver: ResizeObserver | undefined;

function measureDescriptionOverflow(): void {
  if (expanded.value) return;
  descriptionTruncated.value = Boolean(
    description.value && description.value.scrollHeight > description.value.clientHeight + 1,
  );
}

function observeDescription(): void {
  descriptionObserver?.disconnect();
  if (description.value) descriptionObserver?.observe(description.value);
  measureDescriptionOverflow();
}

function toggleExpanded(): void {
  expanded.value = !expanded.value;
  if (!expanded.value) void nextTick(measureDescriptionOverflow);
}

watch(
  () => props.video?.id,
  async () => {
    expanded.value = false;
    descriptionTruncated.value = false;
    await nextTick();
    observeDescription();
  },
);

onMounted(() => {
  if ("ResizeObserver" in globalThis) {
    descriptionObserver = new globalThis.ResizeObserver(measureDescriptionOverflow);
  }
  observeDescription();
});
onBeforeUnmount(() => descriptionObserver?.disconnect());
</script>

<template>
  <section v-if="video" class="mt-4" aria-labelledby="video-title">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h1 id="video-title">
          {{ video.title }}
        </h1>
        <AuthorLinks v-if="video.authors.length" class="mt-2 block" :authors="video.authors" />
      </div>
      <PlayerProgressMenu
        label="Video actions"
        reset-label="Reset progress"
        regenerate-label="Regenerate thumbnails"
        :resetting="resetting"
        :regenerating="regenerating"
        @reset="$emit('reset')"
        @regenerate="$emit('regenerate')"
      />
    </header>

    <div
      v-if="video.description || video.chapters.length"
      :id="detailsId"
      class="mt-4 border-t border-line pt-4"
    >
      <p
        v-if="video.description"
        ref="description"
        class="max-w-[780px]"
        :class="expanded ? '' : 'max-[860px]:line-clamp-4'"
      >
        {{ video.description }}
      </p>
      <ChapterList
        v-if="video.chapters.length"
        class="max-w-[780px]"
        :class="video.description ? 'mt-4' : ''"
        :chapters="video.chapters"
        :collapsed="!expanded"
        :current-time="currentTime"
        @seek="$emit('seek', $event)"
      />
    </div>

    <AppButton
      v-if="expandable"
      class="mx-auto mt-2 hidden min-h-9 cursor-pointer items-center justify-center gap-2 border-0 bg-transparent px-2 text-link hover:bg-transparent hover:underline max-[860px]:flex"
      :aria-controls="detailsId"
      :aria-expanded="expanded"
      @click="toggleExpanded"
    >
      <span>{{ disclosureLabel }}</span>
      <svg
        viewBox="0 0 12 12"
        fill="none"
        class="h-3 w-3 shrink-0 transition-transform duration-150"
        :class="expanded ? 'rotate-180' : ''"
        aria-hidden="true"
      >
        <path
          d="M2 4L6 8L10 4"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </AppButton>
  </section>
</template>
