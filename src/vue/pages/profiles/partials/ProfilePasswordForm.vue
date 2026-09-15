<script setup lang="ts">
import { shallowRef } from "vue";
import type { ProfileDto } from "@/api.js";
import AppButton from "@/components/ui/AppButton.vue";
import AppInput from "@/components/ui/AppInput.vue";
import FormField from "@/components/ui/FormField.vue";
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
  <form class="mt-8 grid gap-4 border-t border-line pt-8" @submit.prevent="submit">
    <h2 class="text-xl font-bold">Profile lock</h2>
    <p class="text-sm text-muted">
      Changing the lock requires this profile to be unlocked again on every device.
    </p>
    <AlertMessage v-if="error">{{ error }}</AlertMessage>
    <FormField v-slot="field" label="New profile password" required
      ><AppInput
        :id="field.inputId"
        v-model="password"
        type="password"
        autocomplete="new-password"
        minlength="8"
        maxlength="72"
        required
    /></FormField>
    <FormField v-slot="field" label="Confirm profile password" :error="validationError" required
      ><AppInput
        :id="field.inputId"
        v-model="confirmPassword"
        :aria-describedby="field.describedBy"
        :invalid="field.invalid"
        type="password"
        autocomplete="new-password"
        required
    /></FormField>
    <div class="flex flex-wrap gap-3">
      <AppButton type="submit" :loading="busy">Set password</AppButton
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
