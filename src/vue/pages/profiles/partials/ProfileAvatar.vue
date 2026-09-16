<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: "sm" | "md" }>(), { size: "md" });
</script>
<template>
  <span
    class="grid shrink-0 place-items-center bg-pine"
    :class="size === 'sm' ? 'size-10 text-xl' : 'size-20 text-3xl'"
    aria-hidden="true"
    >{{ [...name][0]?.toUpperCase() }}</span
  >
</template>
