<script setup lang="ts">
import { shallowRef } from "vue";
import type { ProfileDto } from "@/api.js";
import PanelCard from "@/components/ui/PanelCard.vue";
import PanelCardHeader from "@/components/ui/PanelCardHeader.vue";
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
  <PanelCard :elevated="false" padding="none">
    <PanelCardHeader
      title="Profile lock"
      description="Changing the lock requires this profile to be unlocked again on every device."
    />
    <form class="grid gap-4 p-[clamp(22px,4vw,34px)]" @submit.prevent="submit">
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
  </PanelCard>
</template>
