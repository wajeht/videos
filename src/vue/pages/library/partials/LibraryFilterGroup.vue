<script setup lang="ts">
import { computed, shallowRef } from "vue";
import type { LibraryDto } from "@/api.js";
import AppButton from "@/components/ui/AppButton.vue";

const props = withDefaults(
  defineProps<{
    allLabel: string;
    collapsedLimit?: number;
    hideLabel?: boolean;
    label: string;
    loading?: boolean;
    name: string;
    options: LibraryDto["authors"];
  }>(),
  { collapsedLimit: 10, hideLabel: false, loading: false },
);
const emit = defineEmits<{ prefetch: [selection: string[]] }>();
const selected = defineModel<string[]>({ required: true });
const expanded = shallowRef(false);
const allOptions = computed(() => {
  const missing = selected.value
    .filter((name) => !props.options.some((option) => option.name === name))
    .map((name) => ({ name, count: 0 }));
  return [...missing, ...props.options];
});
const visible = computed(() =>
  expanded.value ? allOptions.value : allOptions.value.slice(0, props.collapsedLimit),
);

function prefetchOption(name: string): void {
  const selection = selected.value.includes(name)
    ? selected.value.filter((selectedName) => selectedName !== name)
    : [...selected.value, name];
  emit("prefetch", selection);
}
</script>

<template>
  <fieldset :aria-busy="loading ? 'true' : undefined">
    <legend :class="hideLabel ? 'sr-only' : 'mb-3'">
      {{ label }}
    </legend>
    <template v-if="loading">
      <p class="sr-only" role="status">Loading {{ label.toLowerCase() }}…</p>
      <ul class="list-none p-0 space-y-2" aria-hidden="true">
        <li
          v-for="index in collapsedLimit"
          :key="index"
          class="flex items-center gap-2.5 max-[760px]:min-h-11"
        >
          <div class="size-4 shrink-0 animate-pulse bg-mist motion-reduce:animate-none" />
          <div class="h-[1lh] w-3/4 animate-pulse bg-mist motion-reduce:animate-none" />
        </li>
      </ul>
    </template>
    <p v-else-if="!visible.length">{{ allLabel }}</p>
    <ul v-else class="list-none p-0 space-y-2">
      <li v-for="option in visible" :key="option.name">
        <label
          class="flex cursor-pointer items-center gap-2.5 max-[760px]:min-h-11"
          @pointerenter="prefetchOption(option.name)"
        >
          <input
            v-model="selected"
            type="checkbox"
            :name="name"
            :value="option.name"
            class="h-4 w-4 border-line focus-visible:ring-link"
            @focus="prefetchOption(option.name)"
            @pointerdown="prefetchOption(option.name)"
          />
          <span>{{ option.name }} ({{ option.count }})</span>
        </label>
      </li>
    </ul>
    <AppButton
      v-if="!loading && allOptions.length > collapsedLimit"
      class="mt-3 cursor-pointer border-0 bg-transparent p-0 text-link hover:bg-transparent hover:underline"
      @click="expanded = !expanded"
    >
      {{ expanded ? "Show fewer" : `Show all ${allOptions.length}` }}
    </AppButton>
  </fieldset>
</template>
