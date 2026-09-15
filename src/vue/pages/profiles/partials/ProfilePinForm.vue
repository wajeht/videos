<script setup lang="ts">
import { shallowRef } from "vue";
import type { ProfileDto } from "@/api.js";
import AppButton from "@/components/ui/AppButton.vue";
import ProfilePinField from "./ProfilePinField.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
const props = defineProps<{ profile: ProfileDto; busy: boolean; error: string }>();
const emit = defineEmits<{ save: [pin: string | null] }>();
const pin = shallowRef("");
const confirmPin = shallowRef("");
const validationError = shallowRef("");
function submit(): void {
  validationError.value = "";
  if (pin.value !== confirmPin.value) {
    validationError.value = "PINs do not match";
    return;
  }
  emit("save", pin.value);
}
</script>
<template>
  <form class="mt-8 grid gap-4 border-t border-line pt-8" @submit.prevent="submit">
    <h2 class="text-xl font-bold">Profile lock</h2>
    <p class="text-sm text-muted">
      Changing the lock requires this profile to be unlocked again on every device.
    </p>
    <AlertMessage v-if="error">{{ error }}</AlertMessage>
    <ProfilePinField
      v-model="pin"
      label="New profile PIN"
      :disabled="busy"
      autocomplete="new-password"
      required
    />
    <ProfilePinField
      v-model="confirmPin"
      label="Confirm profile PIN"
      :error="validationError"
      :disabled="busy"
      autocomplete="new-password"
      required
    />
    <div class="flex flex-wrap gap-3">
      <AppButton type="submit" :loading="busy">Set PIN</AppButton
      ><AppButton
        v-if="props.profile.role === 'member' && props.profile.isLocked"
        variant="secondary"
        :disabled="busy"
        @click="emit('save', null)"
        >Remove lock</AppButton
      >
    </div>
  </form>
</template>
