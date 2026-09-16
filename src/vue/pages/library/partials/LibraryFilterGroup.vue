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
    <legend :class="hideLabel ? 'sr-only' : 'mb-3 text-[.72rem] font-extrabold text-ink'">
      {{ label }}
    </legend>
    <p v-if="!visible.length" class="text-[.82rem] text-muted">{{ allLabel }}</p>
    <ul v-else class="space-y-2 text-[.86rem]">
      <li v-for="option in visible" :key="option.name">
        <label
          class="flex cursor-pointer items-center gap-2.5 text-ink max-[760px]:min-h-11"
          @pointerenter="prefetchOption(option.name)"
        >
          <input
            v-model="selected"
            type="checkbox"
            :name="name"
            :value="option.name"
            class="h-4 w-4 rounded border-line text-ink focus-visible:ring-belt-light"
            @focus="prefetchOption(option.name)"
            @pointerdown="prefetchOption(option.name)"
          />
          <span>{{ option.name }} ({{ option.count }})</span>
        </label>
      </li>
    </ul>
    <AppButton
      v-if="allOptions.length > collapsedLimit"
      variant="unstyled"
      class="mt-3 text-[.75rem] font-bold text-ink underline"
      @click="expanded = !expanded"
    >
      {{ expanded ? "Show fewer" : `Show all ${allOptions.length}` }}
    </AppButton>
  </fieldset>
</template>
