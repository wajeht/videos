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

const isSetup = computed(() => !props.passwordConfigured || props.adminProfileRequired);

function forwardSetup(password: string, confirmPassword: string, setupToken?: string): void {
  emit("setup", password, confirmPassword, setupToken);
}
</script>

<template>
  <main class="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.48fr)]">
    <aside
      class="relative hidden min-h-screen items-center justify-center overflow-hidden bg-pine-deep px-12 text-white lg:order-2 lg:flex"
      aria-label="A private video archive that stays on your server."
    >
      <div class="w-full max-w-[720px]">
        <div class="mb-14">
          <AppLogo class="text-white" />
        </div>
        <div aria-hidden="true">
          <p
            class="font-display text-[clamp(3.5rem,6vw,6rem)] font-semibold leading-[1.05] tracking-[-0.035em]"
          >
            <span class="block text-white">The archive</span>
            <span class="block text-white">stays home.</span>
          </p>
          <p class="mt-9 max-w-xl text-lg leading-7 font-medium text-white/62">
            A private, opinionated, self-hosted video library.
          </p>
        </div>
      </div>
    </aside>

    <section
      class="grid min-h-screen grid-rows-[1fr_auto] px-5 py-8 lg:order-1 lg:border-r lg:border-line lg:px-8 lg:py-10 xl:px-[clamp(36px,3.5vw,60px)]"
    >
      <PanelCard
        class="w-full max-w-[430px] place-self-center lg:max-w-[400px] lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none"
        padding="none"
      >
        <header class="relative bg-pine-deep px-8 py-7 text-white lg:hidden">
          <AppLogo />
          <p class="mt-3 text-sm leading-6 text-white/68">
            {{
              isSetup
                ? "Set up your library and first admin profile."
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

        <div v-else-if="!passwordConfigured && !setupEnabled" class="px-8 py-8 lg:p-10">
          <h1 class="font-display text-2xl font-extrabold lg:text-[2rem]">Setup unavailable</h1>
          <p class="mt-2 text-sm leading-6 text-muted">
            Configure <code>AUTH_SETUP_TOKEN</code> on the server, then restart the app.
          </p>
        </div>

        <AuthForm
          v-else
          :busy
          :is-setup="isSetup"
          :admin-profile-required
          :message
          :password-error
          :setup-token-required
          @login="emit('login', $event)"
          @setup="forwardSetup"
          @setup-admin="(name, password) => emit('setupAdmin', name, password)"
        />
      </PanelCard>

      <AppFooter class="mt-8 place-self-center" />
    </section>
  </main>
</template>
