<script setup lang="ts">
import { useId } from "vue";

import { useModalDialog } from "@/composables/useModalDialog.js";
import AppButton from "./AppButton.vue";

const props = withDefaults(
  defineProps<{
    closeLabel?: string;
    open: boolean;
    title: string;
  }>(),
  { closeLabel: "Close drawer" },
);

const emit = defineEmits<{ close: [] }>();
const titleId = `drawer-title-${useId()}`;

function requestClose(): void {
  emit("close");
}

const { handleBackdrop, handleCancel } = useModalDialog(() => props.open, requestClose);
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-ink backdrop:bg-pine-deep/45"
      :aria-labelledby="titleId"
      @cancel="handleCancel"
      @click="handleBackdrop"
    >
      <section
        v-if="open"
        data-testid="app-drawer-surface"
        class="absolute inset-x-5 bottom-0 max-h-[72dvh] overflow-hidden rounded-t-[12px] border border-b-0 border-line bg-surface shadow-[0_-18px_70px_rgb(18_22_28_/_28%)]"
        @click.stop
      >
        <header class="flex items-center justify-between gap-5 border-b border-line px-6 py-4">
          <h2 :id="titleId" class="font-display text-xl font-extrabold">{{ title }}</h2>
          <AppButton
            autofocus
            variant="unstyled"
            class="grid h-9 w-9 place-items-center rounded-full text-2xl text-muted hover:bg-mist hover:text-ink"
            :aria-label="closeLabel"
            @click="requestClose"
          >
            ×
          </AppButton>
        </header>
        <div class="max-h-[calc(72dvh-70px)] overflow-y-auto px-6 py-5">
          <slot />
        </div>
      </section>
    </dialog>
  </Teleport>
</template>
