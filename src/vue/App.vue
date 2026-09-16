<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";
import { RouterView, useRoute } from "vue-router";

import OfflineStatusBanner from "@/components/OfflineStatusBanner.vue";
import AppLogo from "@/components/ui/AppLogo.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import ToastViewport from "@/components/ui/ToastViewport.vue";
import { ApiError } from "@/api.js";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import { useAuth } from "@/composables/useAuth.js";
import { useNetworkStatus } from "@/composables/useNetworkStatus.js";
import { frontendError } from "@/frontend-error.js";
import AppShell from "@/layouts/AppShell.vue";
import ProfilesPage from "@/pages/profiles/ProfilesPage.vue";
import AuthPage from "@/pages/auth/AuthPage.vue";
import OfflinePage from "@/pages/OfflinePage.vue";
import UnexpectedErrorPage from "@/pages/UnexpectedErrorPage.vue";
import { setPageTitle } from "@/utils.js";

const auth = useAuth();
const route = useRoute();
const { online } = useNetworkStatus();
const loginAction = useAsyncAction((password: string) => auth.login(password), {
  errorMessage: "Could not sign in",
});
const setupAction = useAsyncAction(
  (password: string, confirmPassword: string, setupToken?: string) =>
    auth.setupPassword(password, confirmPassword, setupToken),
  { errorMessage: "Could not create the library password" },
);
const adminSetupAction = useAsyncAction(
  (name: string, password: string) => auth.setupAdminProfile(name, password),
  { errorMessage: "Could not create the admin profile" },
);
const authBusy = computed(
  () => loginAction.pending.value || setupAction.pending.value || adminSetupAction.pending.value,
);
const loginPasswordError = computed(() => {
  const cause = loginAction.error.value;
  if (cause instanceof ApiError && cause.status === 401) return cause.message;
  return "";
});
const generalAuthError = computed(() => {
  if (loginAction.error.value) {
    if (loginPasswordError.value) return "";
    return loginAction.errorMessage.value;
  }
  return adminSetupAction.errorMessage.value || setupAction.errorMessage.value || auth.state.error;
});
const showBootstrap = shallowRef(false);
let bootstrapTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => auth.state.status,
  (status) => {
    clearTimeout(bootstrapTimer);
    showBootstrap.value = false;
    if (status === "loading") {
      bootstrapTimer = setTimeout(() => {
        showBootstrap.value = true;
      }, 250);
    }
  },
  { immediate: true },
);
watch(online, (isOnline) => {
  if (isOnline && auth.state.status === "error") void auth.initialize();
});
watch(
  [() => auth.state.status, () => route.name, () => route.meta.title, () => frontendError.visible],
  ([status, routeName, routeTitle, hasFrontendError]) => {
    if (hasFrontendError) return;
    if (routeName === "not-found") {
      setPageTitle(routeTitle);
      return;
    }
    if (status === "error") {
      setPageTitle("Connection unavailable");
      return;
    }
    if (status !== "loading") setPageTitle(routeTitle);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(bootstrapTimer));

async function login(password: string): Promise<void> {
  adminSetupAction.clearError();
  setupAction.clearError();
  await loginAction.run(password);
}

async function setup(
  password: string,
  confirmPassword: string,
  setupToken?: string,
): Promise<void> {
  loginAction.clearError();
  await setupAction.run(password, confirmPassword, setupToken);
}
</script>

<template>
  <UnexpectedErrorPage v-if="frontendError.visible" />
  <main
    v-else-if="auth.state.status === 'loading'"
    class="grid min-h-screen place-items-center bg-canvas px-5"
  >
    <div v-if="showBootstrap" class="text-center" role="status">
      <AppLogo />
      <p class="mt-3">Opening Videos…</p>
    </div>
  </main>
  <ProfilesPage
    v-else-if="
      auth.state.status === 'authenticated' &&
      !auth.state.adminProfileRequired &&
      !auth.state.profile
    "
  />
  <AppShell v-else-if="auth.state.status === 'authenticated' && !auth.state.adminProfileRequired">
    <OfflineStatusBanner v-if="!online" />
    <RouterView />
  </AppShell>
  <RouterView v-else-if="route.name === 'not-found'" v-slot="{ Component }">
    <component :is="Component" standalone />
  </RouterView>
  <OfflinePage v-else-if="auth.state.status === 'error'" @retry="auth.initialize" />
  <AuthPage
    v-else
    :status="auth.state.status"
    :password-configured="auth.state.passwordConfigured"
    :admin-profile-required="auth.state.adminProfileRequired"
    :setup-enabled="auth.state.setupEnabled"
    :setup-token-required="auth.state.setupTokenRequired"
    :busy="authBusy"
    :message="generalAuthError"
    :password-error="loginPasswordError"
    @login="login"
    @setup="setup"
    @setup-admin="adminSetupAction.run"
    @retry="auth.initialize"
  />
  <ConfirmDialog v-if="!frontendError.visible" />
  <ToastViewport v-if="!frontendError.visible" />
</template>
