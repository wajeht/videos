<script setup lang="ts">
import { shallowRef } from "vue";
import type { ProfileDto } from "@/api.js";
import FormSection from "@/components/ui/FormSection.vue";
import AppInput from "@/components/ui/AppInput.vue";
import FormField from "@/components/ui/FormField.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
const props = defineProps<{ profile: ProfileDto; busy: boolean; error: string }>();
const emit = defineEmits<{ save: [password: string | null] }>();
const password = shallowRef("");
const confirmPassword = shallowRef("");
const validationError = shallowRef("");
function submit(): void {
  validationError.value = "";
  if (password.value !== confirmPassword.value) {
    validationError.value = "Passwords do not match";
    return;
  }
  emit("save", password.value);
}
</script>
<template>
  <FormSection
    title="Profile lock"
    description="Changing the lock requires this profile to be unlocked again on every device."
  >
    <form class="grid gap-4" @submit.prevent="submit">
      <AlertMessage v-if="error">{{ error }}</AlertMessage>
      <FormField
        v-slot="field"
        label="New profile password"
        help-text="Use at least 8 characters."
        required
      >
        <AppInput
          :id="field.inputId"
          v-model="password"
          :aria-describedby="field.describedBy"
          :invalid="field.invalid"
          :disabled="busy"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="72"
          required
        />
      </FormField>
      <FormField v-slot="field" label="Confirm profile password" :error="validationError" required>
        <AppInput
          :id="field.inputId"
          v-model="confirmPassword"
          :aria-describedby="field.describedBy"
          :invalid="field.invalid"
          :disabled="busy"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="72"
          required
        />
      </FormField>
      <div
        class="flex flex-wrap justify-end gap-3 max-[600px]:grid max-[600px]:auto-cols-fr max-[600px]:grid-flow-col"
      >
        <AppButton
          v-if="props.profile.role === 'member' && props.profile.isLocked"
          :disabled="busy"
          @click="emit('save', null)"
          >Remove lock</AppButton
        >
        <AppButton type="submit" :loading="busy">Set password</AppButton>
      </div>
    </form>
  </FormSection>
</template>
