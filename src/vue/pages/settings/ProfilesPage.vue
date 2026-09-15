<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { api, type ProfileDto, type CreateProfileInput } from "@/api.js";
import { useAuth } from "@/composables/useAuth.js";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import { useConfirm } from "@/composables/useConfirm.js";
import SettingsLayout from "./partials/SettingsLayout.vue";
import PanelCardHeader from "@/components/ui/PanelCardHeader.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import PanelCard from "@/components/ui/PanelCard.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
import ProfileTable from "./partials/ProfileTable.vue";
import ProfileDetailsForm from "@/pages/profiles/partials/ProfileDetailsForm.vue";
import ProfilePasswordForm from "@/pages/profiles/partials/ProfilePasswordForm.vue";
const auth = useAuth();
const route = useRoute();
const router = useRouter();
const prefetch = useRoutePrefetch();
const confirmation = useConfirm();
const admin = computed(() => auth.state.profile?.role === "admin");
const profiles = useQuery({
  queryKey: ["profiles"],
  queryFn: () => api.listProfiles(),
  enabled: admin,
});
const creating = computed(() => route.name === "settings-profile-new");
const editRoute = computed(() => route.name === "settings-profile-edit");
const editing = computed(() => {
  if (!admin.value) return auth.state.profile;
  return profiles.data.value?.find((profile) => profile.id === route.params.profileId) ?? null;
});
const unavailable = computed(() => {
  if (creating.value) return !admin.value;
  if (!editRoute.value) return false;
  if (!admin.value) return route.params.profileId !== auth.state.profile?.id;
  return profiles.isSuccess.value && !editing.value;
});
const showForm = computed(
  () => !admin.value || creating.value || (editRoute.value && editing.value !== null),
);
const save = useAsyncAction(async (input: CreateProfileInput) => {
  if (editing.value) {
    const { name, role } = input;
    await api.updateProfile(editing.value.id, { name, role });
    await auth.initialize();
  } else await api.createProfile(input);
  if (admin.value) {
    await profiles.refetch();
    await router.push({ name: "settings-profiles" });
  }
});
const lock = useAsyncAction(async (password: string | null) => {
  if (!editing.value) return;
  await api.changeProfilePassword(editing.value.id, password);
  await auth.initialize();
});
const remove = useAsyncAction(async (profile: ProfileDto) => {
  if (
    !(await confirmation.confirm({
      title: `Delete ${profile.name}?`,
      message: "Their watch progress and preferences will also be deleted.",
      confirmLabel: "Delete profile",
      variant: "danger",
    }))
  )
    return;
  await api.deleteProfile(profile.id);
  if (profile.id === auth.state.profile?.id) await auth.initialize();
  else await profiles.refetch();
});
watch(
  () => route.fullPath,
  () => {
    save.clearError();
    lock.clearError();
    remove.clearError();
  },
);
</script>
<template>
  <NotFoundPage v-if="unavailable" />
  <SettingsLayout v-else>
    <section
      id="settings-profiles-panel"
      class="grid min-w-0 gap-[clamp(18px,2vw,30px)]"
      aria-labelledby="settings-profiles-link"
    >
      <template v-if="showForm">
        <ProfileDetailsForm
          :key="editing?.id ?? 'new'"
          :profile="editing"
          :admin="admin"
          :busy="save.pending.value"
          :error="save.errorMessage.value"
          @save="save.run($event)"
          @cancel="router.push({ name: 'settings-profiles' })"
        />
        <ProfilePasswordForm
          v-if="editing"
          :key="editing.id"
          :profile="editing"
          :busy="lock.pending.value"
          :error="lock.errorMessage.value"
          @save="lock.run($event)"
        />
      </template>
      <PanelCard v-else :elevated="false" padding="none">
        <PanelCardHeader
          :title="editRoute ? 'Edit profile' : 'Manage profiles'"
          :description="editRoute ? undefined : 'Add profiles and manage their access.'"
        />
        <div class="p-[clamp(22px,4vw,34px)]">
          <AlertMessage v-if="profiles.isError.value" class="mt-4"
            >Could not load profiles.
            <AppButton variant="secondary" @click="profiles.refetch()"
              >Try again</AppButton
            ></AlertMessage
          >
          <AlertMessage v-if="remove.errorMessage.value" class="mt-4">{{
            remove.errorMessage.value
          }}</AlertMessage>
          <p v-if="profiles.isPending.value" class="mt-4" role="status">Loading profiles…</p>
          <ProfileTable
            v-if="!editRoute && profiles.data.value"
            :profiles="profiles.data.value"
            :busy="remove.pending.value"
            @remove="remove.run($event)"
          />
          <div v-if="!editRoute" class="mt-8 flex justify-end">
            <AppButton
              :as="IntentRouterLink"
              :to="{ name: 'settings-profile-new' }"
              :prefetch="prefetch.settingsProfiles"
              >Add profile</AppButton
            >
          </div>
        </div>
      </PanelCard>
    </section>
  </SettingsLayout>
</template>
