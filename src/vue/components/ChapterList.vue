<script setup lang="ts">
import { computed } from "vue";

import type { ChapterDto } from "@/api.js";
import AppButton from "@/components/ui/AppButton.vue";

const props = withDefaults(
  defineProps<{ chapters: ChapterDto[]; collapsed?: boolean; currentTime: number }>(),
  { collapsed: false },
);
const emit = defineEmits<{ seek: [startSeconds: number] }>();

const activeIndex = computed(() => {
  let active = -1;
  for (const [index, chapter] of props.chapters.entries()) {
    if (chapter.startSeconds > props.currentTime) break;
    active = index;
  }
  return active;
});

function timestampText(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
</script>

<template>
  <ol class="list-none p-0" aria-label="Video chapters">
    <li
      v-for="(chapter, index) in chapters"
      :key="chapter.startSeconds"
      class="border-0 border-b border-solid border-line last:border-b-0"
      :class="collapsed && index >= 3 ? 'max-[860px]:hidden' : ''"
    >
      <AppButton
        class="grid min-h-[54px] w-full cursor-pointer grid-cols-[72px_52px_minmax(0,1fr)] items-center gap-2 rounded-none border-0 bg-transparent p-0 text-left text-link hover:bg-transparent hover:underline"
        :class="index === activeIndex ? 'font-bold' : ''"
        :aria-current="index === activeIndex ? 'true' : undefined"
        @click="emit('seek', chapter.startSeconds)"
      >
        <span class="overflow-hidden bg-mist">
          <img
            v-if="chapter.thumbnailUrl"
            class="h-10 w-full object-cover"
            :src="chapter.thumbnailUrl"
            alt=""
          />
          <span v-else class="block h-10 w-full" aria-hidden="true" />
        </span>
        <span class="tabular-nums">
          {{ timestampText(chapter.startSeconds) }}
        </span>
        <span class="py-3">
          {{ chapter.title }}
        </span>
      </AppButton>
    </li>
  </ol>
</template>
