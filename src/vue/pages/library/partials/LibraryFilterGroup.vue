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
    name: string;
    options: LibraryDto["authors"];
  }>(),
  { collapsedLimit: 10, hideLabel: false },
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
  <fieldset>
    <legend :class="hideLabel ? 'sr-only' : 'mb-3'">
      {{ label }}
    </legend>
    <p v-if="!visible.length">{{ allLabel }}</p>
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
      v-if="allOptions.length > collapsedLimit"
      class="mt-3 underline"
      @click="expanded = !expanded"
    >
      {{ expanded ? "Show fewer" : `Show all ${allOptions.length}` }}
    </AppButton>
  </fieldset>
</template>
