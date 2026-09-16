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
      <p v-if="eyebrow" class="mb-[9px] text-sm font-medium text-muted">
        {{ eyebrow }}
      </p>
      <component
        :is="`h${headingLevel}`"
        class="font-display text-[clamp(1.75rem,2.6vw,2.25rem)] leading-[1.15] font-semibold tracking-[-.025em]"
      >
        {{ title }}
      </component>
      <p v-if="description" class="mt-3 max-w-[600px] text-[.92rem] leading-6 text-muted">
        {{ description }}
      </p>
    </div>
    <slot name="aside" />
  </header>
</template>
