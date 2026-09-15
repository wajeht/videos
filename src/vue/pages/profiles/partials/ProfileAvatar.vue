<script setup lang="ts">
import type { ProfileDto } from "@/api.js";
defineProps<{ name: string; avatarKey: ProfileDto["avatarKey"] }>();
const colors = {
  pine: "bg-pine text-white",
  clay: "bg-clay text-white",
  gold: "bg-belt text-pine-deep",
  slate: "bg-slate-600 text-white",
  sage: "bg-green-200 text-pine-deep",
  plum: "bg-purple-800 text-white",
};
</script>
<template>
  <span
    :class="colors[avatarKey]"
    class="grid size-20 shrink-0 place-items-center rounded-xl font-display text-3xl font-bold"
    aria-hidden="true"
    >{{ name.slice(0, 1).toUpperCase() }}</span
  >
</template>
