<script setup lang="ts">
import { shallowRef } from "vue";

import AlertMessage from "@/components/ui/AlertMessage.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AppInput from "@/components/ui/AppInput.vue";
import FormField from "@/components/ui/FormField.vue";

const props = defineProps<{
  busy: boolean;
  isSetup: boolean;
  message?: string;
  passwordError?: string;
  setupTokenRequired: boolean;
}>();
const emit = defineEmits<{
  login: [password: string];
  setup: [
    password: string,
    confirmPassword: string,
    adminName: string,
    adminPassword: string,
    setupToken?: string,
  ];
}>();

const password = shallowRef("");
const confirmPassword = shallowRef("");
const adminName = shallowRef("");
const adminPassword = shallowRef("");
const confirmAdminPassword = shallowRef("");
const adminPasswordError = shallowRef("");
const setupToken = shallowRef("");
const formError = shallowRef("");

function submit(): void {
  if (props.busy) return;
  formError.value = "";
  adminPasswordError.value = "";
  if (props.isSetup && password.value !== confirmPassword.value) {
    formError.value = "Passwords do not match";
    return;
  }
  if (props.isSetup && adminPassword.value !== confirmAdminPassword.value) {
    adminPasswordError.value = "Passwords do not match";
    return;
  }
  if (props.isSetup) {
    emit(
      "setup",
      password.value,
      confirmPassword.value,
      adminName.value,
      adminPassword.value,
      setupToken.value || undefined,
    );
  } else {
    emit("login", password.value);
  }
}
</script>

<template>
  <form class="px-8 py-8 lg:p-0" @submit.prevent="submit">
    <h1
      class="font-display text-3xl font-black tracking-[-.025em] uppercase lg:text-[2.4rem] lg:leading-none"
    >
      {{ isSetup ? "Set up your library" : "Welcome back" }}
    </h1>
    <p class="mt-3 hidden text-sm leading-6 text-muted lg:block">
      {{
        isSetup
          ? "Create the password that protects your private video library."
          : "Please sign in to continue."
      }}
    </p>
    <AlertMessage v-if="message" class="mt-4">
      {{ message }}
    </AlertMessage>
    <input
      class="sr-only"
      name="username"
      value="admin"
      autocomplete="username"
      readonly
      tabindex="-1"
    />

    <FormField
      v-if="isSetup && setupTokenRequired"
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
      v-if="isSetup"
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

    <fieldset v-if="isSetup" class="mt-8 grid gap-4 border-t border-line pt-6">
      <legend class="font-bold">Your admin profile</legend>
      <p class="text-sm text-muted">
        This profile manages the library. Keep its password separate from the shared app password.
      </p>
      <FormField v-slot="field" label="Profile name" required
        ><AppInput :id="field.inputId" v-model="adminName" maxlength="40" required
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
    <AppButton
      class="mt-6"
      block
      size="lg"
      type="submit"
      :loading="busy"
      loading-label="Please wait…"
    >
      {{ isSetup ? "Create library" : "Sign in" }}
    </AppButton>
  </form>
</template>
