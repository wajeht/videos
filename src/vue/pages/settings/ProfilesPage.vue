<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { api, type ProfileDto, type CreateProfileInput } from "@/api.js";
import { useAuth } from "@/composables/useAuth.js";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import { useConfirm } from "@/composables/useConfirm.js";
import { useToast } from "@/composables/useToast.js";
import SettingsLayout from "./partials/SettingsLayout.vue";
import PanelCardHeader from "@/components/ui/PanelCardHeader.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import PanelCard from "@/components/ui/PanelCard.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
import ProfileList from "./partials/ProfileList.vue";
import ProfileDetailsForm from "@/pages/profiles/partials/ProfileDetailsForm.vue";
import ProfilePasswordForm from "@/pages/profiles/partials/ProfilePasswordForm.vue";
import { profilesQueryOptions } from "@/queries.js";
const auth = useAuth();
const route = useRoute();
const router = useRouter();
const prefetch = useRoutePrefetch();
const confirmation = useConfirm();
const toast = useToast();
const admin = computed(() => auth.state.profile?.role === "admin");
const profiles = useQuery({
  ...profilesQueryOptions(),
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
  const sourceRoute = router.currentRoute.value;
  const successMessage = editing.value ? "Profile updated" : "Profile created";
  if (editing.value) {
    const profileId = editing.value.id;
    const name = input.name.trim();
    await api.updateProfile(profileId, { name });
    auth.updateProfileName(profileId, name);
  } else await api.createProfile(input);
  if (admin.value) {
    await profiles.refetch();
    if (router.currentRoute.value === sourceRoute) {
      await router.push({ name: "settings-profiles" });
    }
  }
  toast.success(successMessage);
});
const passwordFormVersion = shallowRef(0);
const lock = useAsyncAction(async (password: string | null) => {
  if (!editing.value) return;
  const profileId = editing.value.id;
  const sourceRoute = router.currentRoute.value;
  await api.changeProfilePassword(profileId, password);
  if (profileId === auth.state.profile?.id) await auth.initialize();
  else {
    await profiles.refetch();
    if (router.currentRoute.value === sourceRoute && editing.value?.id === profileId)
      passwordFormVersion.value++;
  }
  toast.success(password === null ? "Profile lock removed" : "Profile password updated");
});
const remove = useAsyncAction(async (profile: ProfileDto) => {
  const sourceRoute = router.currentRoute.value;
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
  if (router.currentRoute.value === sourceRoute) {
    await router.replace({ name: "settings-profiles" });
  }
  await profiles.refetch();
  toast.success("Profile deleted");
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
          :busy="save.pending.value || remove.pending.value"
          :error="save.errorMessage.value"
          @save="save.run($event)"
          @cancel="router.push({ name: 'settings-profiles' })"
        />
        <ProfilePasswordForm
          v-if="editing"
          :key="`${editing.id}:${passwordFormVersion}`"
          :profile="editing"
          :busy="lock.pending.value || remove.pending.value"
          :error="lock.errorMessage.value"
          @save="lock.run($event)"
        />
        <PanelCard v-if="admin && editing?.role === 'member'" :elevated="false" padding="none">
          <PanelCardHeader
            title="Delete profile"
            description="Permanently delete this profile, watch progress, and preferences."
          />
          <div class="grid gap-4 p-[clamp(22px,4vw,34px)]">
            <AlertMessage v-if="remove.errorMessage.value">{{
              remove.errorMessage.value
            }}</AlertMessage>
            <AppButton
              class="justify-self-end max-[600px]:w-full"
              variant="danger"
              :disabled="save.pending.value || lock.pending.value"
              :loading="remove.pending.value"
              loading-label="Deleting…"
              @click="remove.run(editing)"
              >Delete profile</AppButton
            >
          </div>
        </PanelCard>
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
          <p v-if="profiles.isPending.value" class="mt-4" role="status">Loading profiles…</p>
          <ProfileList v-if="!editRoute && profiles.data.value" :profiles="profiles.data.value" />
          <div v-if="!editRoute" class="mt-4 flex justify-end border-t border-line pt-6">
            <AppButton
              class="max-[600px]:w-full"
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
