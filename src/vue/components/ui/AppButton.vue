<script setup lang="ts">
import { computed, type Component } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    as?: string | Component;
    block?: boolean;
    disabled?: boolean;
    loading?: boolean;
    loadingLabel?: string;
    type?: "button" | "reset" | "submit";
  }>(),
  {
    as: "button",
    block: false,
    disabled: false,
    loading: false,
    loadingLabel: "Working…",
    type: "button",
  },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
const isDisabled = computed(() => props.disabled || props.loading);
const isButton = computed(() => props.as === "button");

function handleClick(event: MouseEvent): void {
  if (isDisabled.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  emit("click", event);
}
</script>

<template>
  <component
    :is="as"
    v-bind="$attrs"
    :type="isButton ? type : undefined"
    :disabled="isButton ? isDisabled : undefined"
    :aria-disabled="!isButton && isDisabled ? 'true' : undefined"
    :aria-busy="loading ? 'true' : undefined"
    :class="[
      block ? 'w-full' : '',
      !isButton && isDisabled ? 'pointer-events-none opacity-55' : '',
    ]"
    @click="handleClick"
  >
    <template v-if="loading">
      <span
        class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        aria-hidden="true"
      />
      {{ loadingLabel }}
    </template>
    <slot v-else />
  </component>
</template>
