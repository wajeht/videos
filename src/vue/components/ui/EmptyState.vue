<script setup lang="ts">
import PanelCard from "./PanelCard.vue";

withDefaults(
  defineProps<{
    description?: string;
    framed?: boolean;
    headingLevel?: 1 | 2 | 3;
    title: string;
  }>(),
  { description: "", framed: true, headingLevel: 3 },
);
</script>

<template>
  <component
    :is="framed ? PanelCard : 'section'"
    v-bind="framed ? { variant: 'subtle' } : {}"
    class="grid min-h-80 place-items-center content-center p-10 text-center"
  >
    <component :is="`h${headingLevel}`" class="mb-2">
      {{ title }}
    </component>
    <p v-if="description" class="max-w-[480px]">{{ description }}</p>
    <div v-if="$slots.details" class="mt-3 max-w-[480px]">
      <slot name="details" />
    </div>
    <div v-if="$slots.actions" class="mt-[22px] flex flex-wrap justify-center gap-2">
      <slot name="actions" />
    </div>
  </component>
</template>
