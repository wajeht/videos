<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: "default" | "lg";
    variant?: "error" | "info" | "success";
  }>(),
  { size: "default", variant: "error" },
);
</script>

<template>
  <div
    :class="[
      'rounded-[7px] border',
      size === 'lg' ? 'px-[18px] py-[14px] text-[.88rem]' : 'px-3 py-2 text-sm',
      variant === 'error' ? 'border-clay/50 bg-clay-soft text-clay-ink' : '',
      variant === 'success' ? 'border-line bg-mist text-ink' : '',
      variant === 'info' ? 'border-line bg-surface text-muted' : '',
    ]"
    :role="variant === 'error' ? 'alert' : 'status'"
  >
    <slot />
  </div>
</template>
