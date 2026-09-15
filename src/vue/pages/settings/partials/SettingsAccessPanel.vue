<script setup lang="ts">
import { computed, shallowRef } from "vue";

import { ApiError } from "@/api.js";
import AlertMessage from "@/components/ui/AlertMessage.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AppInput from "@/components/ui/AppInput.vue";
import FormField from "@/components/ui/FormField.vue";
import PanelCard from "@/components/ui/PanelCard.vue";
import PanelCardHeader from "@/components/ui/PanelCardHeader.vue";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import { useAuth } from "@/composables/useAuth.js";
import { useToast } from "@/composables/useToast.js";

const auth = useAuth();
const toast = useToast();
const currentPassword = shallowRef("");
const newPassword = shallowRef("");
const confirmPassword = shallowRef("");
const validationError = shallowRef("");
const passwordAction = useAsyncAction(
  () => auth.changePassword(currentPassword.value, newPassword.value, confirmPassword.value),
  {
    errorMessage: "Could not change password",
    onSuccess: () => {
      currentPassword.value = "";
      newPassword.value = "";
      confirmPassword.value = "";
      toast.success("Password changed successfully");
    },
  },
);
const currentPasswordError = computed(() => {
  const cause = passwordAction.error.value;
  if (cause instanceof ApiError && cause.message === "Current password is incorrect") {
    return cause.message;
  }
  return "";
});
const generalPasswordError = computed(() => {
  if (currentPasswordError.value) return "";
  return passwordAction.errorMessage.value;
});

async function changePassword(): Promise<void> {
  validationError.value = "";
  passwordAction.clearError();
  if (newPassword.value !== confirmPassword.value) {
    validationError.value = "Passwords do not match";
    return;
  }
  await passwordAction.run();
}
</script>

<template>
  <PanelCard :elevated="false" padding="none">
    <PanelCardHeader
      title="Access"
      description="Change the password for this private library or sign out of this device."
    />
    <form class="grid gap-4 p-[clamp(22px,4vw,34px)]" @submit.prevent="changePassword">
      <AlertMessage v-if="generalPasswordError">
        {{ generalPasswordError }}
      </AlertMessage>
      <input
        class="sr-only"
        name="username"
        value="admin"
        autocomplete="username"
        readonly
        tabindex="-1"
      />
      <FormField v-slot="field" label="Current password" :error="currentPasswordError" required>
        <AppInput
          :id="field.inputId"
          v-model="currentPassword"
          :aria-describedby="field.describedBy"
          :invalid="field.invalid"
          type="password"
          autocomplete="current-password"
          required
        />
      </FormField>
      <FormField
        v-slot="field"
        label="New password"
        help-text="Use at least 15 characters."
        required
      >
        <AppInput
          :id="field.inputId"
          v-model="newPassword"
          :aria-describedby="field.describedBy"
          :invalid="field.invalid"
          type="password"
          autocomplete="new-password"
          minlength="15"
          maxlength="72"
          required
        />
      </FormField>
      <FormField v-slot="field" label="Confirm new password" :error="validationError" required>
        <AppInput
          :id="field.inputId"
          v-model="confirmPassword"
          :aria-describedby="field.describedBy"
          :invalid="field.invalid"
          type="password"
          autocomplete="new-password"
          minlength="15"
          maxlength="72"
          required
        />
      </FormField>
      <AppButton
        class="mt-4 justify-self-end max-[600px]:w-full"
        data-change-password
        type="submit"
        :loading="passwordAction.pending.value"
        loading-label="Saving…"
      >
        Change password
      </AppButton>
    </form>
  </PanelCard>
</template>
