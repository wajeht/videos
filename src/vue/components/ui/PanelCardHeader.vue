<script setup lang="ts">
withDefaults(
  defineProps<{
    description?: string;
    headingLevel?: 2 | 3;
    title: string;
  }>(),
  { description: undefined, headingLevel: 2 },
);
</script>

<template>
  <header class="border-b border-line px-[clamp(22px,4vw,34px)] py-6">
    <component :is="`h${headingLevel}`">
      {{ title }}
    </component>
    <p v-if="description" class="mt-1.5 max-w-[620px]">
      {{ description }}
    </p>
  </header>
</template>
