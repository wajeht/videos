<script setup lang="ts">
import { computed } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    as?: string;
    elevated?: boolean;
    padding?: "compact" | "default" | "none";
    variant?: "default" | "subtle";
  }>(),
  { as: "section", elevated: true, padding: "default", variant: "default" },
);

const paddingClasses = computed(
  () =>
    ({
      compact: "p-5",
      default: "p-[clamp(22px,4vw,34px)]",
      none: "",
    })[props.padding],
);
const surfaceClasses = computed(() => {
  if (props.variant === "subtle") return "border-dashed border-line bg-surface/55";
  return ["border-line bg-surface", props.elevated ? "shadow-card" : ""];
});
</script>

<template>
  <component
    :is="as"
    v-bind="$attrs"
    :class="['overflow-hidden rounded-[8px] border', surfaceClasses, paddingClasses]"
  >
    <slot />
  </component>
</template>
