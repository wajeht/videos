<script setup lang="ts">
import AppButton from "./AppButton.vue";

const props = defineProps<{
  disabled?: boolean;
  page: number;
  totalPages: number;
}>();

const emit = defineEmits<{ change: [page: number]; prefetch: [page: number] }>();
function prefetchPrevious(): void {
  if (!props.disabled && props.page > 1) emit("prefetch", props.page - 1);
}
function prefetchNext(): void {
  if (!props.disabled && props.page < props.totalPages) emit("prefetch", props.page + 1);
}
</script>

<template>
  <nav v-if="totalPages > 1" class="mt-9 flex items-center justify-center gap-4" aria-label="Pages">
    <AppButton
      :disabled="page <= 1 || disabled"
      @pointerenter="prefetchPrevious"
      @focus="prefetchPrevious"
      @pointerdown="prefetchPrevious"
      @click="$emit('change', page - 1)"
    >
      Previous
    </AppButton>
    <span> Page {{ page }} of {{ totalPages }} </span>
    <AppButton
      :disabled="page >= totalPages || disabled"
      @pointerenter="prefetchNext"
      @focus="prefetchNext"
      @pointerdown="prefetchNext"
      @click="$emit('change', page + 1)"
    >
      Next
    </AppButton>
  </nav>
</template>
