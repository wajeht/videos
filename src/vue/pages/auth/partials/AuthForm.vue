<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from "vue";

import AlertMessage from "@/components/ui/AlertMessage.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AppInput from "@/components/ui/AppInput.vue";
import FormField from "@/components/ui/FormField.vue";

const props = defineProps<{
  busy: boolean;
  isSetup: boolean;
  adminProfileRequired: boolean;
  message?: string;
  passwordError?: string;
  setupTokenRequired: boolean;
}>();
const emit = defineEmits<{
  login: [password: string];
  setup: [password: string, confirmPassword: string, setupToken?: string];
  setupAdmin: [name: string, password: string];
}>();

const password = shallowRef("");
const confirmPassword = shallowRef("");
const adminName = shallowRef("");
const adminPassword = shallowRef("");
const confirmAdminPassword = shallowRef("");
const adminPasswordError = shallowRef("");
const setupToken = shallowRef("");
const formError = shallowRef("");
const step = computed(() => (props.adminProfileRequired ? "admin" : "library"));
const adminNameInput = useTemplateRef("adminNameInput");
watch(adminNameInput, (input) => input?.focus(), { flush: "post" });

function submit(): void {
  if (props.busy) return;
  formError.value = "";
  adminPasswordError.value = "";
  if (props.isSetup && step.value === "library") {
    if (password.value !== confirmPassword.value) {
      formError.value = "Passwords do not match";
      return;
    }
    emit("setup", password.value, confirmPassword.value, setupToken.value || undefined);
    return;
  }
  if (props.isSetup && adminPassword.value !== confirmAdminPassword.value) {
    adminPasswordError.value = "Passwords do not match";
    return;
  }
  if (props.isSetup) {
    emit("setupAdmin", adminName.value, adminPassword.value);
  } else {
    emit("login", password.value);
  }
}
</script>

<template>
  <form class="px-8 py-8 lg:p-0" @submit.prevent="submit">
    <h1
      class="font-display text-3xl font-semibold tracking-[-.025em] lg:text-[2.4rem] lg:leading-none"
    >
      {{ isSetup ? "Set up your library" : "Welcome back" }}
    </h1>
    <p class="mt-3 hidden text-sm leading-6 text-muted lg:block">
      {{
        isSetup
          ? step === "library"
            ? "Create the password that protects your private video library."
            : "Create the admin profile that manages your library."
          : "Please sign in to continue."
      }}
    </p>
    <AlertMessage v-if="message" class="mt-4">
      {{ message }}
    </AlertMessage>
    <p v-if="isSetup" class="mt-6 text-sm font-bold text-muted" aria-live="polite">
      {{ step === "library" ? "Step 1 of 2 · Library password" : "Step 2 of 2 · Admin profile" }}
    </p>
    <input
      class="sr-only"
      name="username"
      value="admin"
      autocomplete="username"
      readonly
      tabindex="-1"
    />

    <FormField
      v-if="isSetup && step === 'library' && setupTokenRequired"
      v-slot="{ inputId, describedBy, invalid }"
      class="mt-6"
      label="Setup token"
      help-text="Enter the one-time setup token configured on your server."
      required
    >
      <AppInput
        :id="inputId"
        v-model="setupToken"
        :aria-describedby="describedBy"
        :invalid="invalid"
        type="password"
        autocomplete="one-time-code"
        required
      />
    </FormField>

    <FormField
      v-if="!isSetup || step === 'library'"
      v-slot="{ inputId, describedBy, invalid }"
      class="mt-6"
      label="Password"
      :help-text="isSetup ? 'Use at least 15 characters.' : undefined"
      :error="passwordError"
      required
    >
      <AppInput
        :id="inputId"
        v-model="password"
        :aria-describedby="describedBy"
        :invalid="invalid"
        type="password"
        :autocomplete="isSetup ? 'new-password' : 'current-password'"
        :minlength="isSetup ? 15 : undefined"
        maxlength="72"
        required
        autofocus
      />
    </FormField>

    <FormField
      v-if="isSetup && step === 'library'"
      v-slot="{ inputId, describedBy, invalid }"
      class="mt-4"
      label="Confirm password"
      :error="formError"
      required
    >
      <AppInput
        :id="inputId"
        v-model="confirmPassword"
        :aria-describedby="describedBy"
        :invalid="invalid"
        type="password"
        autocomplete="new-password"
        minlength="15"
        maxlength="72"
        required
      />
    </FormField>

    <fieldset v-if="isSetup && step === 'admin'" class="mt-6 grid gap-4">
      <legend class="sr-only">Your admin profile</legend>
      <p class="text-sm text-muted">
        This profile manages the library. Keep its password separate from the shared app password.
      </p>
      <FormField v-slot="field" label="Profile name" required
        ><AppInput
          ref="adminNameInput"
          :id="field.inputId"
          v-model="adminName"
          maxlength="40"
          required
      /></FormField>
      <FormField
        v-slot="field"
        label="Admin profile password"
        help-text="Use at least 8 characters."
        required
        ><AppInput
          :id="field.inputId"
          v-model="adminPassword"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="72"
          required
      /></FormField>
      <FormField
        v-slot="field"
        label="Confirm admin profile password"
        :error="adminPasswordError"
        required
        ><AppInput
          :id="field.inputId"
          v-model="confirmAdminPassword"
          :aria-describedby="field.describedBy"
          :invalid="field.invalid"
          type="password"
          autocomplete="new-password"
          required
      /></FormField>
    </fieldset>
    <div class="mt-6 grid auto-cols-fr grid-flow-col gap-3">
      <AppButton size="lg" type="submit" :loading="busy" loading-label="Please wait…">
        {{ isSetup ? (step === "library" ? "Continue" : "Finish setup") : "Sign in" }}
      </AppButton>
    </div>
  </form>
</template>
