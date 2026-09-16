<script setup lang="ts">
import type { ProfileDto } from "@/api.js";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import ProfileAvatar from "@/pages/profiles/partials/ProfileAvatar.vue";

defineProps<{ profiles: ProfileDto[] }>();
const prefetch = useRoutePrefetch();
</script>

<template>
  <ul class="list-none p-0 divide-y divide-line" aria-label="Profiles">
    <li v-for="profile in profiles" :key="profile.id">
      <IntentRouterLink
        :to="{ name: 'settings-profile-edit', params: { profileId: profile.id } }"
        :prefetch="prefetch.settingsProfiles"
        :aria-label="`Edit ${profile.name}`"
        class="flex items-center gap-4 px-3 py-5 transition-colors duration-[160ms] hover:bg-porcelain"
      >
        <ProfileAvatar :name="profile.name" size="sm" />
        <div class="min-w-0 flex-1">
          <h3 class="[overflow-wrap:anywhere]">{{ profile.name }}</h3>
          <p class="mt-1">
            {{ profile.role === "admin" ? "Admin" : "Member" }} ·
            {{ profile.isLocked ? "Password protected" : "No password" }}
          </p>
        </div>
        <svg
          class="size-5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m9 5 7 7-7 7" />
        </svg>
      </IntentRouterLink>
    </li>
  </ul>
</template>
