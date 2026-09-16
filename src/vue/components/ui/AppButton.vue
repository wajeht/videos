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
    size?: "icon" | "lg" | "md" | "sm";
    type?: "button" | "reset" | "submit";
    variant?:
      | "accent"
      | "danger"
      | "ghost"
      | "inverse"
      | "outline-inverse"
      | "primary"
      | "secondary"
      | "text"
      | "unstyled";
  }>(),
  {
    as: "button",
    block: false,
    disabled: false,
    loading: false,
    loadingLabel: "Working…",
    size: "md",
    type: "button",
    variant: "primary",
  },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
const isDisabled = computed(() => props.disabled || props.loading);
const isButton = computed(() => props.as === "button");

const variantClasses = computed(
  () =>
    ({
      accent: "border-transparent bg-belt-light text-pine-deep",
      danger: "border-clay bg-clay text-white hover:bg-clay-deep",
      ghost: "border-line bg-surface text-ink hover:border-muted",
      inverse: "border-line bg-mist text-ink hover:border-muted",
      "outline-inverse": "border-white/24 bg-transparent text-white hover:border-white/55",
      primary: "border-transparent bg-pine text-white hover:bg-pine/80",
      secondary: "border-line bg-surface text-ink hover:border-muted",
      text: "border-transparent bg-transparent px-0 text-ink hover:text-belt-light",
      unstyled: "border-0 bg-transparent p-0 text-inherit",
    })[props.variant],
);

const sizeClasses = computed(
  () =>
    ({
      icon: "h-10 w-10 p-0",
      lg: "h-10 px-[18px] text-[.82rem]",
      md: "h-10 px-5 text-[.78rem]",
      sm: "min-h-9 px-4 text-[.75rem]",
    })[props.size],
);

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
      variant === 'unstyled'
        ? 'cursor-pointer disabled:cursor-not-allowed disabled:opacity-55'
        : 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[5px] border font-semibold transition-colors duration-[160ms] disabled:cursor-not-allowed disabled:opacity-55',
      variant === 'unstyled' ? '' : sizeClasses,
      variantClasses,
      block ? 'w-full' : '',
      !isButton && isDisabled ? 'pointer-events-none opacity-55' : '',
    ]"
    @click="handleClick"
  >
    <template v-if="loading">
      <span
        class="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        aria-hidden="true"
      />
      {{ loadingLabel }}
    </template>
    <slot v-else />
  </component>
</template>
