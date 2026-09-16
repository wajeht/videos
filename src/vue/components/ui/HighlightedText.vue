<script setup lang="ts">
import { computed } from "vue";

import { mergeTextRanges, type TextRange } from "../../../library/video-search.js";

const props = defineProps<{ text: string; ranges: TextRange[] }>();

const segments = computed(() => {
  const ranges = mergeTextRanges(props.ranges)
    .map((range) => ({
      start: Math.max(0, Math.min(props.text.length, range.start)),
      end: Math.max(0, Math.min(props.text.length, range.end)),
    }))
    .filter((range) => range.end > range.start);
  const result: Array<{ text: string; highlighted: boolean }> = [];
  let offset = 0;
  for (const range of ranges) {
    if (range.start > offset)
      result.push({ text: props.text.slice(offset, range.start), highlighted: false });
    result.push({ text: props.text.slice(range.start, range.end), highlighted: true });
    offset = range.end;
  }
  if (offset < props.text.length)
    result.push({ text: props.text.slice(offset), highlighted: false });
  return result.length ? result : [{ text: props.text, highlighted: false }];
});
</script>

<template>
  <template v-for="(segment, index) in segments" :key="index">
    <mark v-if="segment.highlighted" class="bg-link/45 px-px text-inherit">{{ segment.text }}</mark>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>
