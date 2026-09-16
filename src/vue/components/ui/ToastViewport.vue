<script setup lang="ts">
import { useToast } from "@/composables/useToast.js";
import AppButton from "./AppButton.vue";

const toast = useToast();
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed top-5 right-5 z-[100] grid w-[min(380px,calc(100%-40px))] gap-2"
      aria-label="Notifications"
    >
      <div
        v-for="item in toast.toasts.value"
        :key="item.id"
        class="pointer-events-auto flex items-start justify-between gap-4 border px-4 py-3"
        :class="
          {
            error: 'border-clay/50 bg-clay-soft text-clay-ink',
            info: 'border-line bg-surface text-ink',
            success: 'border-line bg-surface text-ink',
          }[item.kind]
        "
        :role="item.kind === 'error' ? 'alert' : 'status'"
      >
        <span>{{ item.message }}</span>
        <AppButton
          class="opacity-70 hover:opacity-100"
          :aria-label="`Dismiss ${item.message}`"
          @click="toast.dismiss(item.id)"
        >
          ×
        </AppButton>
      </div>
    </div>
  </Teleport>
</template>
