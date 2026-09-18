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
import ProfileAvatar from "./partials/ProfileAvatar.vue";
import ProfileUnlockForm from "./partials/ProfileUnlockForm.vue";
import { profilesQueryOptions } from "@/queries.js";
const auth = useAuth();
const route = useRoute();
const router = useRouter();
const profiles = useQuery(profilesQueryOptions());
const selected = computed(() =>
  profiles.data.value?.find((profile) => profile.id === route.query.unlockProfile),
);
const unlock = useAsyncAction(
  (profile: ProfileDto, password: string) => auth.selectProfile(profile.id, password),
  { onSuccess: clearSelection },
);
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
        <div
          class="mt-8 flex flex-wrap items-start justify-center gap-6"
          :aria-busy="profiles.isPending.value ? 'true' : undefined"
        >
          <template v-if="profiles.isPending.value">
            <div
              v-for="index in 3"
              :key="index"
              class="grid w-40 animate-pulse justify-items-center gap-2 p-2 motion-reduce:animate-none"
              aria-hidden="true"
            >
              <div class="size-20 bg-pine" />
              <div class="h-[1lh] w-24 bg-mist" />
              <div class="h-[1lh] w-20 bg-mist text-sm" />
            </div>
          </template>
          <template v-else>
            <AppButton
              v-for="profile in profiles.data.value"
              :key="profile.id"
              class="grid w-40 cursor-pointer justify-items-center gap-2 border-0 bg-transparent p-2 hover:bg-transparent disabled:cursor-default"
              :disabled="unlock.pending.value"
              @click="select(profile)"
            >
              <ProfileAvatar :name="profile.name" />
              <span class="w-full break-words font-semibold text-link hover:underline">{{
                profile.name
              }}</span>
              <span class="text-sm text-muted"
                >{{ profile.role === "admin" ? "Admin · " : ""
                }}{{ profile.isLocked ? "Locked" : "Open" }}</span
              >
            </AppButton>
          </template>
        </div>
      </template>
    </section>
  </main>
</template>
