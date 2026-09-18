<script setup lang="ts">
import type { ProfileDto } from "@/api.js";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";

defineProps<{ profiles: ProfileDto[]; loading?: boolean }>();
const prefetch = useRoutePrefetch();
</script>

<template>
  <table class="profiles-table" aria-label="Profiles" :aria-busy="loading ? 'true' : undefined">
    <thead>
      <tr>
        <th scope="col">Name</th>
        <th scope="col">Role</th>
        <th scope="col">Password</th>
      </tr>
    </thead>
    <tbody v-if="loading" aria-hidden="true">
      <tr v-for="row in 3" :key="row">
        <td v-for="column in 3" :key="column">
          <div class="h-[1lh] w-3/4 animate-pulse bg-mist motion-reduce:animate-none" />
        </td>
      </tr>
    </tbody>
    <tbody v-else>
      <tr v-for="profile in profiles" :key="profile.id">
        <td>
          <IntentRouterLink
            :to="{ name: 'settings-profile-edit', params: { profileId: profile.id } }"
            :prefetch="() => prefetch.settingsProfiles(true)"
            :aria-label="`Edit ${profile.name}`"
            >{{ profile.name }}</IntentRouterLink
          >
        </td>
        <td>{{ profile.role === "admin" ? "Admin" : "Member" }}</td>
        <td>{{ profile.isLocked ? "Password protected" : "No password" }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.profiles-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

.profiles-table th,
.profiles-table td {
  padding: 10px;
  text-align: left;
  overflow-wrap: anywhere;
}

.profiles-table th {
  border-top: 1px solid var(--color-line);
  background: var(--color-mist);
  font-weight: 600;
}

.profiles-table tr {
  border-bottom: 1px solid var(--color-line);
}

.profiles-table tbody tr:hover {
  background: #fafafa;
}
</style>
