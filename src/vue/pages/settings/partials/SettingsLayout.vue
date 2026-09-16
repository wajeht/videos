<script setup lang="ts">
import type { VNode } from "vue";
import { useRouter } from "vue-router";

import AlertMessage from "@/components/ui/AlertMessage.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AppFooter from "@/components/ui/AppFooter.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import { useAuth } from "@/composables/useAuth.js";
import { useConfirm } from "@/composables/useConfirm.js";
import StandardPageLayout from "@/layouts/StandardPageLayout.vue";
import SettingsNavigation from "@/pages/settings/partials/SettingsNavigation.vue";

defineSlots<{
  default(): VNode[];
}>();

const auth = useAuth();
const router = useRouter();
const confirmation = useConfirm();
const switchAction = useAsyncAction(
  async () => {
    await auth.clearProfile();
    await router.replace({ name: "settings-profiles" });
  },
  { errorMessage: "Could not switch profiles" },
);
const logoutAction = useAsyncAction(() => auth.logout(), {
  errorMessage: "Could not sign out",
});

async function logout(): Promise<void> {
  const confirmed = await confirmation.confirm({
    title: "Sign out?",
    message: "You will need the library password to access it again.",
    confirmLabel: "Sign out",
  });
  if (!confirmed) return;
  await logoutAction.run();
}
</script>

<template>
  <StandardPageLayout
    class="min-[601px]:flex min-[601px]:min-h-[calc(100vh-66px)] min-[601px]:flex-col min-[601px]:pb-10"
  >
    <PageHeader eyebrow="Videos settings" title="Settings" />

    <AlertMessage
      v-if="logoutAction.errorMessage.value || switchAction.errorMessage.value"
      class="mt-8"
      size="lg"
    >
      {{ logoutAction.errorMessage.value || switchAction.errorMessage.value }}
    </AlertMessage>

    <div
      class="mt-6 grid grid-cols-[240px_minmax(0,1fr)] items-start max-[760px]:grid-cols-1 max-[760px]:gap-8"
      data-settings-layout
    >
      <aside class="grid gap-[30px] pr-10 max-[760px]:pr-0">
        <SettingsNavigation />
        <div class="grid gap-3 max-[760px]:hidden" data-desktop-sign-out-container>
          <AppButton
            block
            :loading="switchAction.pending.value"
            loading-label="Switching…"
            @click="switchAction.run()"
            >Switch profile</AppButton
          >
          <AppButton
            block
            :loading="logoutAction.pending.value"
            loading-label="Signing out…"
            data-desktop-sign-out
            @click="logout"
          >
            Sign out
          </AppButton>
        </div>
      </aside>

      <div class="min-w-0 self-stretch pl-8 max-[760px]:pl-0">
        <slot />
      </div>

      <div class="col-span-full hidden gap-3 max-[760px]:grid" data-mobile-sign-out-container>
        <AppButton
          block
          :loading="switchAction.pending.value"
          loading-label="Switching…"
          @click="switchAction.run()"
          >Switch profile</AppButton
        >
        <AppButton
          block
          :loading="logoutAction.pending.value"
          loading-label="Signing out…"
          data-mobile-sign-out
          @click="logout"
        >
          Sign out
        </AppButton>
      </div>
    </div>

    <AppFooter class="mt-12 min-[601px]:mt-auto min-[601px]:pt-12" />
  </StandardPageLayout>
</template>
