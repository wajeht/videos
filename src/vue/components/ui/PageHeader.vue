<script setup lang="ts">
withDefaults(
  defineProps<{
    description?: string;
    eyebrow?: string;
    headingLevel?: 1 | 2;
    title: string;
  }>(),
  { description: undefined, headingLevel: 1 },
);
</script>

<template>
  <header
    class="flex items-end justify-between gap-6 max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-2"
  >
    <div>
      <p v-if="eyebrow" class="mb-[9px]">
        {{ eyebrow }}
      </p>
      <component :is="`h${headingLevel}`">
        {{ title }}
      </component>
      <p v-if="description" class="mt-3 max-w-[600px]">
        {{ description }}
      </p>
    </div>
    <slot name="aside" />
  </header>
</template>
