<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ compact?: boolean; title: string }>(), {
  compact: false,
});
const initials = computed(() => {
  const words = props.title.trim().split(/\s+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => [...word][0])
      .join("")
      .toUpperCase() || "V"
  );
});
</script>

<template>
  <div
    class="grid place-items-center bg-mist font-display font-semibold text-muted"
    :class="compact ? 'text-base' : 'text-[clamp(2rem,4vw,3.75rem)]'"
    aria-hidden="true"
  >
    {{ initials }}
  </div>
</template>
