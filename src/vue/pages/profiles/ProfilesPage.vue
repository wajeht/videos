<script setup lang="ts">
import { computed, shallowRef } from "vue";
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
const profiles = useQuery(profilesQueryOptions());
const selected = shallowRef<ProfileDto | null>(null);
const unlock = useAsyncAction((profile: ProfileDto, password: string) =>
  auth.selectProfile(profile.id, password),
);
const passwordError = computed(() =>
  unlock.error.value instanceof ApiError &&
  unlock.error.value.message === "Incorrect profile password"
    ? unlock.error.value.message
    : "",
);
const generalError = computed(() => (passwordError.value ? "" : unlock.errorMessage.value));
async function select(profile: ProfileDto): Promise<void> {
  unlock.clearError();
  if (profile.isLocked) selected.value = profile;
  else {
    await unlock.run(profile, "");
    if (passwordError.value) {
      selected.value = { ...profile, isLocked: true };
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
        @cancel="
          selected = null;
          unlock.clearError();
        "
      />
      <template v-else>
        <div class="grid justify-items-center">
          <PageHeader
            title="Who’s watching?"
            description="Your progress. Your place in the library."
          />
        </div>

        <p v-if="profiles.isPending.value" class="mt-8" role="status">Loading profiles…</p>
        <AlertMessage v-if="profiles.isError.value" class="mt-8"
          >Could not load profiles.
          <AppButton variant="secondary" @click="profiles.refetch()"
            >Try again</AppButton
          ></AlertMessage
        >
        <AlertMessage v-if="generalError" class="mt-8">{{ generalError }}</AlertMessage>
        <div class="mt-10 flex flex-wrap justify-center gap-6">
          <AppButton
            v-for="profile in profiles.data.value"
            :key="profile.id"
            variant="unstyled"
            class="grid w-28 justify-items-center gap-3 rounded-[8px] p-2 text-pine-deep transition-colors duration-[160ms] hover:bg-porcelain"
            :disabled="unlock.pending.value"
            @click="select(profile)"
          >
            <ProfileAvatar :name="profile.name" />
            <span class="max-w-full break-words font-bold">{{ profile.name }}</span>
            <span class="text-xs text-muted"
              >{{ profile.role === "admin" ? "Admin · " : ""
              }}{{ profile.isLocked ? "Locked" : "Open" }}</span
            >
          </AppButton>
        </div>
      </template>
    </section>
  </main>
</template>
