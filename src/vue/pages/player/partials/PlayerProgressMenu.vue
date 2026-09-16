<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from "vue";

import AppButton from "@/components/ui/AppButton.vue";

withDefaults(
  defineProps<{
    label: string;
    resetLabel: string;
    resetting: boolean;
    autoplayEnabled?: boolean;
    autoplayLabel?: string;
    regenerateLabel?: string;
    regenerating?: boolean;
  }>(),
  { autoplayEnabled: false, regenerating: false },
);
const emit = defineEmits<{
  autoplayChange: [enabled: boolean];
  reset: [];
  regenerate: [];
}>();

const open = shallowRef(false);
const root = useTemplateRef<HTMLElement>("root");
const trigger = useTemplateRef<HTMLButtonElement>("trigger");

function close(): void {
  open.value = false;
}

function closeAndFocusTrigger(): void {
  close();
  trigger.value?.focus();
}

function closeOnOutsidePointer(event: PointerEvent): void {
  const target = event.target;

  if (target instanceof Node && !root.value?.contains(target)) {
    close();
  }
}

function resetProgress(): void {
  close();
  emit("reset");
}

function regenerateThumbnail(): void {
  close();
  emit("regenerate");
}

onMounted(() => document.addEventListener("pointerdown", closeOnOutsidePointer));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeOnOutsidePointer));
</script>

<template>
  <div ref="root" class="relative flex-none" @keydown.esc.stop="closeAndFocusTrigger">
    <button
      ref="trigger"
      type="button"
      class="grid h-9 w-9 cursor-pointer place-items-center border-0 bg-transparent hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="flex flex-col items-center gap-0.5" aria-hidden="true">
        <span class="player-progress-menu-dot h-1 w-1 rounded-full bg-current" />
        <span class="player-progress-menu-dot h-1 w-1 rounded-full bg-current" />
        <span class="player-progress-menu-dot h-1 w-1 rounded-full bg-current" />
      </span>
      <span
        v-if="autoplayLabel && autoplayEnabled"
        class="player-progress-menu-autoplay-indicator rounded-full absolute top-0.5 right-0.5 h-2.5 w-2.5 border-2 border-porcelain bg-link"
        aria-hidden="true"
      />
    </button>

    <div
      v-if="open"
      role="menu"
      :aria-label="label"
      class="absolute right-0 z-20 mt-2 min-w-56 border border-line bg-surface p-1"
    >
      <AppButton
        v-if="autoplayLabel"
        role="menuitemcheckbox"
        :aria-checked="autoplayEnabled"
        class="menu-action flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        @click="emit('autoplayChange', !autoplayEnabled)"
      >
        <span>{{ autoplayLabel }}</span>
        <span
          class="bg-mist px-2 py-0.5"
          :class="autoplayEnabled ? 'font-semibold text-ink' : 'text-muted'"
          >{{ autoplayEnabled ? "On" : "Off" }}</span
        >
      </AppButton>
      <hr v-if="autoplayLabel" class="menu-divider" />
      <AppButton
        v-if="regenerateLabel"
        role="menuitem"
        class="menu-action flex w-full items-center gap-2 px-3 py-2 text-left"
        :loading="regenerating"
        loading-label="Updating…"
        @click="regenerateThumbnail"
        >{{ regenerateLabel }}</AppButton
      >
      <hr v-if="regenerateLabel" class="menu-divider" />
      <AppButton
        role="menuitem"
        class="menu-action flex w-full items-center gap-2 px-3 py-2 text-left"
        :loading="resetting"
        loading-label="Resetting…"
        @click="resetProgress"
        >{{ resetLabel }}</AppButton
      >
    </div>
  </div>
</template>

<style scoped>
.menu-action {
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-link);
  cursor: pointer;
}

.menu-action:hover {
  background: transparent;
  text-decoration: underline;
}

.menu-divider {
  margin: 4px 12px;
  border: 0;
  border-top: 1px solid var(--color-line);
}
</style>
