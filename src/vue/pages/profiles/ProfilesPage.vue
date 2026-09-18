<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { ApiError, type ProfileDto } from "@/api.js";
import { useAuth } from "@/composables/useAuth.js";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import AppButton from "@/components/ui/AppButton.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import ProfilePickerGrid from "./partials/ProfilePickerGrid.vue";
import ProfileUnlockForm from "./partials/ProfileUnlockForm.vue";
import { profilesQueryOptions } from "@/queries.js";
const auth = useAuth();
const route = useRoute();
const router = useRouter();
const profiles = useQuery(profilesQueryOptions());
const selected = computed(() =>
  profiles.data.value?.find((profile) => profile.id === route.query.unlockProfile),
);
const unlock = useAsyncAction(async (profile: ProfileDto, password: string) => {
  const sourceRoute = router.currentRoute.value;
  try {
    await auth.selectProfile(profile.id, password);
  } catch (caught) {
    if (router.currentRoute.value === sourceRoute) throw caught;
    return;
  }
  if (router.currentRoute.value === sourceRoute) await clearSelection();
});
watch(() => route.query.unlockProfile, unlock.clearError);
const passwordError = computed(() =>
  unlock.error.value instanceof ApiError &&
  unlock.error.value.message === "Incorrect profile password"
    ? unlock.error.value.message
    : "",
);
const generalError = computed(() => (passwordError.value ? "" : unlock.errorMessage.value));
async function clearSelection(): Promise<void> {
  if (!route.query.unlockProfile) return;
  await router.replace({
    query: { ...route.query, unlockProfile: undefined },
    hash: route.hash,
  });
}
async function showUnlock(profileId: string): Promise<void> {
  await router.push({
    query: { ...route.query, unlockProfile: profileId },
    hash: route.hash,
  });
}
async function select(profile: ProfileDto): Promise<void> {
  unlock.clearError();
  if (profile.isLocked) await showUnlock(profile.id);
  else {
    await unlock.run(profile, "");
    if (passwordError.value) {
      await showUnlock(profile.id);
      unlock.clearError();
    }
  }
}
</script>
<template>
  <main class="grid min-h-screen place-items-center bg-canvas px-5 py-12">
    <section class="w-full max-w-3xl text-center">
      <ProfileUnlockForm
        v-if="selected"
        :key="selected.id"
        :profile="selected"
        :busy="unlock.pending.value"
        :password-error="passwordError"
        :error="generalError"
        @unlock="unlock.run(selected, $event)"
        @cancel="clearSelection"
      />
      <template v-else>
        <div class="grid justify-items-center">
          <PageHeader
            title="Who’s watching?"
            description="Your progress. Your place in the library."
          />
        </div>

        <p v-if="profiles.isPending.value" class="sr-only" role="status">Loading profiles…</p>
        <AlertMessage v-if="profiles.isError.value" class="mt-8"
          >Could not load profiles.
          <AppButton @click="profiles.refetch()">Try again</AppButton></AlertMessage
        >
        <AlertMessage v-if="generalError" class="mt-8">{{ generalError }}</AlertMessage>
        <ProfilePickerGrid
          :profiles="profiles.data.value ?? []"
          :loading="profiles.isPending.value"
          :disabled="unlock.pending.value"
          @select="select"
        />
      </template>
    </section>
  </main>
</template>
