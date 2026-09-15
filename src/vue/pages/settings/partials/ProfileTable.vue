<script setup lang="ts">
import type { ProfileDto } from "@/api.js";
import AppButton from "@/components/ui/AppButton.vue";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import ProfileAvatar from "@/pages/profiles/partials/ProfileAvatar.vue";

defineProps<{ profiles: ProfileDto[]; busy: boolean }>();
const emit = defineEmits<{ remove: [profile: ProfileDto] }>();
const prefetch = useRoutePrefetch();
</script>

<template>
  <table class="block w-full text-left lg:table" aria-label="Profiles">
    <thead
      class="hidden text-xs font-bold uppercase tracking-wide text-muted lg:table-header-group"
    >
      <tr class="border-b border-line">
        <th scope="col" class="pb-3 pr-4">Profile</th>
        <th scope="col" class="pb-3 pr-4">Role</th>
        <th scope="col" class="pb-3 pr-4">Password lock</th>
        <th scope="col" class="pb-3 text-right">Actions</th>
      </tr>
    </thead>
    <tbody class="block divide-y divide-line lg:table-row-group">
      <tr
        v-for="profile in profiles"
        :key="profile.id"
        class="grid gap-3 py-4 first:pt-0 last:pb-0 lg:table-row"
      >
        <th scope="row" class="min-w-0 text-left lg:py-4 lg:pr-4">
          <div class="flex items-center gap-3">
            <ProfileAvatar :name="profile.name" size="sm" />
            <div class="min-w-0">
              <h3 class="font-bold [overflow-wrap:anywhere]">{{ profile.name }}</h3>
              <p class="mt-1 text-sm font-normal text-muted lg:hidden">
                {{ profile.role === "admin" ? "Admin" : "Member" }} ·
                {{ profile.isLocked ? "Locked" : "Open" }}
              </p>
            </div>
          </div>
        </th>
        <td class="hidden text-sm lg:table-cell lg:py-4 lg:pr-4">
          {{ profile.role === "admin" ? "Admin" : "Member" }}
        </td>
        <td class="hidden text-sm lg:table-cell lg:py-4 lg:pr-4">
          {{ profile.isLocked ? "Enabled" : "Disabled" }}
        </td>
        <td class="lg:py-4">
          <div class="grid auto-cols-fr grid-flow-col gap-3 lg:flex lg:justify-end">
            <AppButton
              :as="IntentRouterLink"
              :to="{ name: 'settings-profile-edit', params: { profileId: profile.id } }"
              :prefetch="prefetch.settingsProfiles"
              variant="secondary"
              >Edit</AppButton
            >
            <AppButton
              v-if="profile.role === 'member'"
              variant="danger"
              :disabled="busy"
              @click="emit('remove', profile)"
              >Delete</AppButton
            >
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
