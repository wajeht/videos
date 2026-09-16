<script setup lang="ts">
withDefaults(
  defineProps<{
    value: number;
    label?: string;
    compact?: boolean;
    light?: boolean;
  }>(),
  { label: "Video progress", compact: false, light: false },
);
</script>

<template>
  <div>
    <div
      class="relative overflow-hidden"
      :class="[compact ? 'h-1.5' : 'h-[9px]', light ? 'bg-mist' : 'bg-line']"
    >
      <span
        class="absolute inset-y-0 left-0 bg-link transition-[width] duration-[350ms]"
        :style="{ width: `${Math.min(100, Math.max(0, value))}%` }"
      />
    </div>
    <span class="sr-only">{{ label }}: {{ value }}%</span>
  </div>
</template>
