<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm.js";
import AppButton from "./AppButton.vue";
import AppModal from "./AppModal.vue";

const confirmation = useConfirm();
</script>

<template>
  <AppModal
    :open="Boolean(confirmation.active.value)"
    :title="confirmation.active.value?.title ?? 'Confirm action'"
    size="sm"
    @close="confirmation.cancel"
  >
    <p>{{ confirmation.active.value?.message }}</p>
    <template #footer>
      <AppButton autofocus @click="confirmation.cancel">
        {{ confirmation.active.value?.cancelLabel }}
      </AppButton>
      <AppButton @click="confirmation.accept">
        {{ confirmation.active.value?.confirmLabel }}
      </AppButton>
    </template>
  </AppModal>
</template>
