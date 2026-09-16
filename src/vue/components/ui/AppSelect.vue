<script setup lang="ts" generic="T extends string | number">
import { computed, useTemplateRef } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    invalid?: boolean;
    variant?: "bare" | "dark" | "default";
  }>(),
  { disabled: false, invalid: false, variant: "default" },
);

const model = defineModel<T>();
const select = useTemplateRef<HTMLSelectElement>("select");
const selectClasses = computed(
  () =>
    ({
      bare: "border-0 bg-transparent p-0 text-ink outline-0",
      dark: "border-white/16 bg-pine text-white focus:border-belt-light",
      default: "border-line bg-surface text-ink focus:border-muted",
    })[props.variant],
);

defineExpose({
  blur: () => select.value?.blur(),
  focus: () => select.value?.focus(),
  select,
});
</script>

<template>
  <select
    ref="select"
    v-model="model"
    v-bind="$attrs"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    :class="[
      'min-w-0 cursor-pointer outline-none disabled:cursor-not-allowed disabled:opacity-55',
      variant === 'bare' ? '' : 'min-h-10 rounded-[7px] border px-3 text-sm',
      invalid ? 'border-clay focus:border-clay' : '',
      selectClasses,
    ]"
  >
    <slot />
  </select>
</template>
