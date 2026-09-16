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
      :class="collapsed && index >= 3 ? 'max-[860px]:hidden' : ''"
    >
      <AppButton
        class="group grid min-h-[54px] w-full cursor-pointer grid-cols-[72px_52px_20px_minmax(0,1fr)] items-center gap-2 border-b border-l-4 border-line px-3 text-left transition-colors last:border-b-0 hover:bg-mist focus-visible:z-[1] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-link"
        :class="index === activeIndex ? 'border-l-link bg-mist' : 'border-l-transparent'"
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
        <span class="tabular-nums" :class="index === activeIndex ? 'text-link' : 'text-muted'">
          {{ timestampText(chapter.startSeconds) }}
        </span>
        <span class="relative grid h-full place-items-center" aria-hidden="true">
          <span
            v-if="index < chapters.length - 1"
            class="absolute top-1/2 bottom-[-50%] left-1/2 w-px -translate-x-1/2 bg-mist"
          />
          <span
            class="relative h-2.5 w-2.5 border-2 transition-colors"
            :class="
              index === activeIndex
                ? 'border-link bg-link'
                : 'border-line bg-transparent group-hover:border-line'
            "
          />
        </span>
        <span class="py-3" :class="index === activeIndex ? 'text-ink' : 'text-muted'">
          {{ chapter.title }}
        </span>
      </AppButton>
    </li>
  </ol>
</template>
