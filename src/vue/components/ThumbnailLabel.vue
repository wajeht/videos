<script setup lang="ts">
defineProps<{ compact?: boolean }>();
</script>

<template>
  <span
    class="absolute border border-line bg-surface/95 px-1 py-0.5 text-xs leading-none whitespace-nowrap text-ink tabular-nums"
    :class="compact ? 'right-0.5 bottom-0.5' : 'right-2 bottom-2'"
  >
    <slot />
  </span>
</template>
