<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from "vue";

import AppButton from "@/components/ui/AppButton.vue";

const props = withDefaults(
  defineProps<{
    label: string;
    resetLabel: string;
    resetting: boolean;
    autoplayEnabled?: boolean;
    autoplayLabel?: string;
    regenerateLabel?: string;
    regenerating?: boolean;
    tone?: "dark" | "light";
  }>(),
  { autoplayEnabled: false, tone: "dark", regenerating: false },
);
const emit = defineEmits<{
  autoplayChange: [enabled: boolean];
  reset: [];
  regenerate: [];
}>();

const open = shallowRef(false);
const root = useTemplateRef<HTMLElement>("root");
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const triggerClasses = computed(() =>
  props.tone === "light"
    ? "text-ink/58 hover:bg-white/8 hover:text-ink focus-visible:outline-belt-light"
    : "text-white/58 hover:bg-white/8 hover:text-white focus-visible:outline-belt-light",
);
const panelClasses = computed(() =>
  props.tone === "light" ? "border-line bg-surface" : "border-white/12 bg-pine",
);
const itemClasses = computed(() =>
  props.tone === "light"
    ? "text-ink hover:bg-white/8 focus-visible:bg-white/8"
    : "text-white/78 hover:bg-white/8 focus-visible:bg-white/8",
);

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
      class="grid h-9 w-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-lg leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
      :class="triggerClasses"
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
        class="player-progress-menu-autoplay-indicator absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-porcelain bg-belt"
        aria-hidden="true"
      />
    </button>

    <div
      v-if="open"
      role="menu"
      :aria-label="label"
      class="absolute right-0 z-20 mt-2 min-w-56 rounded-[7px] border p-1"
      :class="panelClasses"
    >
      <AppButton
        v-if="autoplayLabel"
        variant="unstyled"
        role="menuitemcheckbox"
        :aria-checked="autoplayEnabled"
        class="flex w-full items-center justify-between gap-3 rounded-[5px] px-3 py-2 text-left text-sm focus-visible:outline-none"
        :class="itemClasses"
        @click="emit('autoplayChange', !autoplayEnabled)"
      >
        <span>{{ autoplayLabel }}</span>
        <span
          class="rounded-full px-2 py-0.5 text-[.65rem] font-extrabold"
          :class="autoplayEnabled ? 'bg-belt/18 text-belt-ink' : 'bg-mist text-muted'"
          >{{ autoplayEnabled ? "On" : "Off" }}</span
        >
      </AppButton>
      <AppButton
        v-if="regenerateLabel"
        variant="unstyled"
        role="menuitem"
        class="flex w-full items-center gap-2 rounded-[5px] px-3 py-2 text-left text-sm focus-visible:outline-none"
        :class="itemClasses"
        :loading="regenerating"
        loading-label="Updating…"
        @click="regenerateThumbnail"
        >{{ regenerateLabel }}</AppButton
      >
      <AppButton
        variant="unstyled"
        role="menuitem"
        class="flex w-full items-center gap-2 rounded-[5px] px-3 py-2 text-left text-sm focus-visible:outline-none"
        :class="itemClasses"
        :loading="resetting"
        loading-label="Resetting…"
        @click="resetProgress"
        >{{ resetLabel }}</AppButton
      >
    </div>
  </div>
</template>
