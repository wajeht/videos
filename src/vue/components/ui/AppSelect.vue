<script setup lang="ts" generic="T extends string | number">
import { useTemplateRef } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    invalid?: boolean;
  }>(),
  { disabled: false, invalid: false },
);

const model = defineModel<T>();
const select = useTemplateRef<HTMLSelectElement>("select");
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
    class="min-w-0 max-w-full"
  >
    <slot />
  </select>
</template>
