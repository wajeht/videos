<script setup lang="ts">
import type { AuthStatus } from "@/composables/useAuth.js";
import AppButton from "@/components/ui/AppButton.vue";
import AppFooter from "@/components/ui/AppFooter.vue";
import AppLogo from "@/components/ui/AppLogo.vue";
import AuthForm from "@/pages/auth/partials/AuthForm.vue";

defineProps<{
  status: AuthStatus;
  passwordConfigured: boolean;
  adminProfileRequired: boolean;
  setupEnabled: boolean;
  setupTokenRequired: boolean;
  busy: boolean;
  message?: string;
  passwordError?: string;
}>();

const emit = defineEmits<{
  login: [password: string];
  setup: [password: string, confirmPassword: string, setupToken?: string];
  setupAdmin: [name: string, password: string];
  retry: [];
}>();

function forwardSetup(password: string, confirmPassword: string, setupToken?: string): void {
  emit("setup", password, confirmPassword, setupToken);
}
</script>

<template>
  <main class="grid min-h-screen grid-rows-[1fr_auto] bg-canvas px-5 py-8">
    <section class="w-full max-w-[420px] place-self-center">
      <header class="mb-8"><AppLogo /></header>
      <div v-if="status === 'loading'" class="py-8">Checking your session…</div>

      <div v-else-if="status === 'error'" class="py-6">
        <h1>Connection required</h1>
        <p class="mt-2">
          {{ message || "The app could not verify your session." }}
        </p>
        <AppButton class="mt-6" block @click="emit('retry')"> Try again </AppButton>
      </div>

      <div v-else-if="!passwordConfigured && !setupEnabled" class="py-6">
        <h1>Setup unavailable</h1>
        <p class="mt-2">
          Configure <code>AUTH_SETUP_TOKEN</code> on the server, then restart the app.
        </p>
      </div>

      <AuthForm
        v-else
        :busy
        :is-setup="!passwordConfigured || adminProfileRequired"
        :admin-profile-required
        :message
        :password-error
        :setup-token-required
        @login="emit('login', $event)"
        @setup="forwardSetup"
        @setup-admin="(name, password) => emit('setupAdmin', name, password)"
      />
    </section>
    <AppFooter class="mt-8 place-self-center" />
  </main>
</template>
