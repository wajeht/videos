<script setup lang="ts">
import type { LibraryPageSize } from "@/api.js";

const LIBRARY_PAGE_SIZES: LibraryPageSize[] = [12, 24, 48, 96];

withDefaults(
  defineProps<{
    disabled?: boolean;
    error?: string;
    hideLabel?: boolean;
    name?: string;
  }>(),
  { disabled: false, error: "", hideLabel: false, name: "library-page-size" },
);
const emit = defineEmits<{ prefetch: [pageSize: LibraryPageSize] }>();
const selected = defineModel<LibraryPageSize>({ required: true });
</script>

<template>
  <fieldset :disabled="disabled">
    <legend :class="hideLabel ? 'sr-only' : 'mb-3'">Videos per page</legend>
    <ul class="list-none p-0 space-y-2">
      <li v-for="size in LIBRARY_PAGE_SIZES" :key="size">
        <label
          class="flex cursor-pointer items-center gap-2.5 max-[760px]:min-h-11"
          @pointerenter="emit('prefetch', size)"
        >
          <input
            v-model="selected"
            type="radio"
            :name="name"
            :value="size"
            class="h-4 w-4 border-line focus-visible:ring-link"
            @focus="emit('prefetch', size)"
            @pointerdown="emit('prefetch', size)"
          />
          <span>{{ size }}</span>
        </label>
      </li>
    </ul>
    <p v-if="error" class="mt-1.5 text-clay-ink" role="alert">{{ error }}</p>
  </fieldset>
</template>
