<script setup lang="ts">
defineProps<{ name: string }>();
</script>
<template>
  <span
    class="grid size-20 shrink-0 place-items-center rounded-xl bg-pine font-display text-3xl font-bold text-white"
    aria-hidden="true"
    >{{ name.slice(0, 1).toUpperCase() }}</span
  >
</template>
