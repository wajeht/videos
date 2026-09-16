<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <fieldset class="mb-0">
    <legend>
      <h2 class="text-base">{{ title }}</h2>
    </legend>
    <p v-if="description" class="mb-4 text-muted">{{ description }}</p>
    <slot />
  </fieldset>
</template>
