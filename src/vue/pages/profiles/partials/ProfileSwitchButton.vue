<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef } from "vue";

import AppButton from "@/components/ui/AppButton.vue";
import { useAuth } from "@/composables/useAuth.js";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import { useToast } from "@/composables/useToast.js";

const auth = useAuth();
const toast = useToast();
const open = shallowRef(false);
const menuId = useId();
const root = useTemplateRef<HTMLElement>("root");
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const menu = useTemplateRef<HTMLElement>("menu");
const action = useAsyncAction(() => auth.clearProfile(), {
  onError: () => toast.error("Could not switch profiles"),
});

function close(): void {
  open.value = false;
}
function closeAndFocusTrigger(): void {
  close();
  trigger.value?.focus();
}
async function openMenu(): Promise<void> {
  open.value = true;
  await nextTick();
  menu.value?.querySelector<HTMLButtonElement>("button")?.focus();
}
function closeOnOutsidePointer(event: PointerEvent): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close();
}
function closeOnFocusOut(event: FocusEvent): void {
  if (event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) close();
}
async function switchProfile(): Promise<void> {
  closeAndFocusTrigger();
  await action.run();
}
onMounted(() => document.addEventListener("pointerdown", closeOnOutsidePointer));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeOnOutsidePointer));
</script>
<template>
  <div
    ref="root"
    class="relative min-w-0"
    @keydown.esc.stop="closeAndFocusTrigger"
    @focusout="closeOnFocusOut"
  >
    <button
      ref="trigger"
      type="button"
      class="max-w-32 truncate border-b-2 px-0 py-2 text-[.76rem] font-bold tracking-[.14em] uppercase min-[861px]:max-w-40"
      :class="
        open ? 'border-belt text-white/90' : 'border-transparent text-white/55 hover:text-white/90'
      "
      :disabled="action.pending.value"
      aria-label="Profile menu"
      aria-haspopup="menu"
      :aria-controls="menuId"
      :aria-expanded="open"
      @click="open ? close() : openMenu()"
      @keydown.down.prevent="openMenu"
      @keydown.up.prevent="openMenu"
    >
      {{ auth.state.profile?.name }}
    </button>
    <div
      v-if="open"
      :id="menuId"
      ref="menu"
      role="menu"
      aria-label="Profile"
      class="absolute right-0 top-full z-20 mt-2 min-w-56 rounded-[7px] border border-white/12 bg-[#242a32] p-1"
      @keydown.down.prevent
      @keydown.up.prevent
    >
      <AppButton
        variant="unstyled"
        role="menuitem"
        class="flex w-full items-center gap-2 rounded-[5px] px-3 py-2 text-left text-sm text-white/78 hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
        @click="switchProfile"
        >Switch profile</AppButton
      >
    </div>
  </div>
</template>
