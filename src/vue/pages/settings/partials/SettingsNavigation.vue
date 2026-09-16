<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import IntentRouterLink from "@/components/IntentRouterLink.vue";
import { useAuth } from "@/composables/useAuth.js";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";

const auth = useAuth();
const route = useRoute();
const prefetch = useRoutePrefetch();
const settingsSections = [
  {
    label: "Library",
    prefetch: prefetch.settingsLibrary,
    routeName: "settings-library",
    value: "library",
  },
  {
    label: "Profiles",
    prefetch: prefetch.settingsProfiles,
    routeName: "settings-profiles",
    value: "profiles",
  },
  {
    label: "Access",
    prefetch: prefetch.settingsAccess,
    routeName: "settings-access",
    value: "access",
  },
] as const;
const sections = computed(() =>
  settingsSections
    .filter((section) => section.value !== "access" || auth.state.profile?.role === "admin")
    .map((section) => {
      const active = route.matched.some((record) => record.path === `/settings/${section.value}`);
      if (active) {
        return {
          ...section,
          active,
          stateClasses: "underline font-bold",
        };
      }
      return {
        ...section,
        active,
        stateClasses: "",
      };
    }),
);
</script>

<template>
  <nav aria-label="Settings sections">
    <div class="grid gap-1 max-[760px]:auto-cols-fr max-[760px]:grid-flow-col max-[760px]:gap-0">
      <IntentRouterLink
        v-for="section in sections"
        :id="`settings-${section.value}-link`"
        :key="section.value"
        :to="{ name: section.routeName }"
        :prefetch="section.prefetch"
        :class="[
          'flex min-h-10 w-full items-center py-2 text-left max-[760px]:justify-center',
          section.stateClasses,
        ]"
        :aria-current="section.active ? 'page' : undefined"
        :aria-controls="`settings-${section.value}-panel`"
      >
        <span>{{ section.label }}</span>
      </IntentRouterLink>
    </div>
  </nav>
</template>
