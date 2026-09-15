<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { api, ApiError, type ProfileDto } from "@/api.js";
import { useAuth } from "@/composables/useAuth.js";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import AppButton from "@/components/ui/AppButton.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
import ProfileAvatar from "./partials/ProfileAvatar.vue";
import ProfileUnlockForm from "./partials/ProfileUnlockForm.vue";
const auth = useAuth();
const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => api.listProfiles() });
const selected = shallowRef<ProfileDto | null>(null);
const unlock = useAsyncAction((profile: ProfileDto, pin: string) =>
  auth.selectProfile(profile.id, pin),
);
const logout = useAsyncAction(() => auth.logout());
const pinError = computed(() =>
  unlock.error.value instanceof ApiError && unlock.error.value.message === "Incorrect profile PIN"
    ? unlock.error.value.message
    : "",
);
const generalError = computed(() => (pinError.value ? "" : unlock.errorMessage.value));
async function select(profile: ProfileDto): Promise<void> {
  unlock.clearError();
  if (profile.isLocked) selected.value = profile;
  else await unlock.run(profile, "");
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
        :pin-error="pinError"
        :error="generalError"
        @unlock="unlock.run(selected, $event)"
        @cancel="
          selected = null;
          unlock.clearError();
        "
      />
      <template v-else>
        <h1 class="font-display text-4xl font-black">Who’s watching?</h1>
        <p class="mt-3 text-muted">Your progress. Your place in the library.</p>

        <p v-if="profiles.isPending.value" class="mt-8" role="status">Loading profiles…</p>
        <AlertMessage v-if="profiles.isError.value" class="mt-8"
          >Could not load profiles.
          <AppButton variant="secondary" @click="profiles.refetch()"
            >Try again</AppButton
          ></AlertMessage
        >
        <AlertMessage v-if="generalError" class="mt-8">{{ generalError }}</AlertMessage>
        <div class="mt-10 flex flex-wrap justify-center gap-6">
          <button
            v-for="profile in profiles.data.value"
            :key="profile.id"
            class="grid w-28 justify-items-center gap-3 rounded-xl p-2 text-pine-deep hover:bg-porcelain focus-visible:outline-2 focus-visible:outline-pine"
            :disabled="unlock.pending.value"
            @click="select(profile)"
          >
            <ProfileAvatar :name="profile.name" />
            <span class="max-w-full break-words font-bold">{{ profile.name }}</span>
            <span class="text-xs text-muted"
              >{{ profile.role === "admin" ? "Admin · " : ""
              }}{{ profile.isLocked ? "Locked" : "Open" }}</span
            >
          </button>
        </div>
        <AlertMessage v-if="logout.errorMessage.value" class="mt-8">{{
          logout.errorMessage.value
        }}</AlertMessage>
        <AppButton
          class="mt-10"
          variant="secondary"
          :loading="logout.pending.value"
          @click="logout.run()"
          >Sign out</AppButton
        >
      </template>
    </section>
  </main>
</template>
