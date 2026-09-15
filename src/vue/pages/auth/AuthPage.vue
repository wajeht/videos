<script setup lang="ts">
import { computed } from "vue";

import type { AuthStatus } from "@/composables/useAuth.js";
import AppButton from "@/components/ui/AppButton.vue";
import AppFooter from "@/components/ui/AppFooter.vue";
import AppLogo from "@/components/ui/AppLogo.vue";
import PanelCard from "@/components/ui/PanelCard.vue";
import AuthForm from "@/pages/auth/partials/AuthForm.vue";

const props = defineProps<{
  status: AuthStatus;
  passwordConfigured: boolean;
  setupEnabled: boolean;
  setupTokenRequired: boolean;
  busy: boolean;
  message?: string;
  passwordError?: string;
}>();

const emit = defineEmits<{
  login: [password: string];
  setup: [
    password: string,
    confirmPassword: string,
    adminName: string,
    adminPin: string,
    setupToken?: string,
  ];
  retry: [];
}>();

const isSetup = computed(() => !props.passwordConfigured);

function forwardSetup(
  password: string,
  confirmPassword: string,
  adminName: string,
  adminPin: string,
  setupToken?: string,
): void {
  emit("setup", password, confirmPassword, adminName, adminPin, setupToken);
}
</script>

<template>
  <main class="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.48fr)]">
    <aside
      class="relative hidden min-h-screen items-center justify-center overflow-hidden bg-pine-deep bg-[radial-gradient(circle_at_78%_18%,rgb(213_139_59_/_9%),transparent_26%),repeating-linear-gradient(90deg,transparent_0_55px,rgb(255_255_255_/_2.5%)_55px_56px)] px-12 text-white lg:order-2 lg:flex"
      aria-label="A private video archive that stays on your server."
    >
      <div
        class="absolute inset-x-0 top-0 h-2 bg-[repeating-linear-gradient(90deg,rgb(8_13_22_/_72%)_0_9px,transparent_9px_16px)]"
        aria-hidden="true"
      />
      <div class="w-full max-w-[720px]">
        <div class="mb-14">
          <AppLogo class="text-white" />
        </div>
        <div aria-hidden="true">
          <p
            class="font-display text-[clamp(4.4rem,7vw,8.5rem)] font-black leading-[0.8] tracking-[-0.035em] uppercase"
          >
            <span class="block text-white/42">The archive</span>
            <span class="block text-white">stays</span>
            <span class="block text-white">home.</span>
          </p>
          <p class="mt-9 max-w-xl text-lg leading-7 font-medium text-white/62">
            A private, opinionated, self-hosted video library.
          </p>
        </div>
      </div>
    </aside>

    <section
      class="grid min-h-screen grid-rows-[1fr_auto] px-5 py-8 lg:order-1 lg:border-r lg:border-pine/10 lg:px-8 lg:py-10 xl:px-[clamp(36px,3.5vw,60px)]"
    >
      <PanelCard
        class="w-full max-w-[430px] place-self-center lg:max-w-[400px] lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none"
        padding="none"
      >
        <header class="relative bg-pine-deep px-8 py-7 text-white lg:hidden">
          <span
            class="absolute inset-x-0 top-0 h-1.5 bg-[repeating-linear-gradient(90deg,rgb(8_13_22_/_72%)_0_7px,transparent_7px_13px)]"
            aria-hidden="true"
          />
          <AppLogo />
          <p class="mt-3 text-sm leading-6 text-white/68">
            {{
              isSetup
                ? "Create the password that protects your private video library."
                : "Please sign in to continue."
            }}
          </p>
        </header>

        <div v-if="status === 'loading'" class="px-8 py-10 text-sm text-muted lg:p-10">
          Checking your session…
        </div>

        <div v-else-if="status === 'error'" class="px-8 py-8 lg:p-10">
          <h1 class="font-display text-2xl font-extrabold lg:text-[2rem]">Connection required</h1>
          <p class="mt-2 text-sm leading-6 text-muted">
            {{ message || "The app could not verify your session." }}
          </p>
          <AppButton class="mt-6" block size="lg" @click="emit('retry')"> Try again </AppButton>
        </div>

        <div v-else-if="isSetup && !setupEnabled" class="px-8 py-8 lg:p-10">
          <h1 class="font-display text-2xl font-extrabold lg:text-[2rem]">Setup unavailable</h1>
          <p class="mt-2 text-sm leading-6 text-muted">
            Configure <code>AUTH_SETUP_TOKEN</code> on the server, then restart the app.
          </p>
        </div>

        <AuthForm
          v-else
          :busy
          :is-setup="isSetup"
          :message
          :password-error
          :setup-token-required
          @login="emit('login', $event)"
          @setup="forwardSetup"
        />
      </PanelCard>

      <AppFooter class="mt-8 place-self-center" />
    </section>
  </main>
</template>
