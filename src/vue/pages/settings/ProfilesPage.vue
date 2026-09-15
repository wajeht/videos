<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { api, type ProfileDto, type CreateProfileInput } from "@/api.js";
import { useAuth } from "@/composables/useAuth.js";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import { useConfirm } from "@/composables/useConfirm.js";
import SettingsLayout from "./partials/SettingsLayout.vue";
import PanelCard from "@/components/ui/PanelCard.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
import ProfileAvatar from "@/pages/profiles/partials/ProfileAvatar.vue";
import ProfileDetailsForm from "@/pages/profiles/partials/ProfileDetailsForm.vue";
import ProfilePasswordForm from "@/pages/profiles/partials/ProfilePasswordForm.vue";
const auth = useAuth();
const confirmation = useConfirm();
const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => api.listProfiles() });
const admin = computed(() => auth.state.profile?.role === "admin");
const visibleProfiles = computed(
  () =>
    profiles.data.value?.filter(
      (profile) => admin.value || profile.id === auth.state.profile?.id,
    ) ?? [],
);
const editing = shallowRef<ProfileDto | null>(null);
const showForm = shallowRef(false);
const save = useAsyncAction(async (input: CreateProfileInput) => {
  if (editing.value) {
    const { name, avatarKey, role } = input;
    await api.updateProfile(editing.value.id, { name, avatarKey, role });
    await auth.initialize();
  } else await api.createProfile(input);
  showForm.value = false;
  await profiles.refetch();
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
function edit(profile: ProfileDto | null): void {
  editing.value = profile;
  showForm.value = true;
  save.clearError();
  lock.clearError();
}
</script>
<template>
  <SettingsLayout>
    <PanelCard
      id="settings-profiles-panel"
      class="min-w-0 p-6"
      :elevated="false"
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
          @cancel="showForm = false"
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
      <template v-else>
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-xl font-bold">{{ admin ? "Manage profiles" : "Your profile" }}</h2>
          <AppButton v-if="admin" @click="edit(null)">Add profile</AppButton>
        </div>
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
        <div
          v-for="profile in visibleProfiles"
          :key="profile.id"
          class="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-6"
        >
          <ProfileAvatar :name="profile.name" :avatar-key="profile.avatarKey" />
          <div class="min-w-0 flex-1">
            <h3 class="break-words font-bold">{{ profile.name }}</h3>
            <p class="text-sm text-muted">
              {{ profile.role === "admin" ? "Admin" : "Member" }} ·
              {{ profile.isLocked ? "Locked" : "Open" }}
            </p>
          </div>
          <AppButton variant="secondary" @click="edit(profile)">Edit</AppButton
          ><AppButton
            v-if="admin"
            variant="danger"
            :disabled="remove.pending.value"
            @click="remove.run(profile)"
            >Delete</AppButton
          >
        </div>
      </template>
    </PanelCard>
  </SettingsLayout>
</template>
