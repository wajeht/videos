<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import IntentRouterLink from "@/components/IntentRouterLink.vue";
import PanelCard from "@/components/ui/PanelCard.vue";
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
  <PanelCard as="nav" class="p-8 max-[760px]:p-0" aria-label="Settings sections">
    <div class="grid gap-1 max-[760px]:auto-cols-fr max-[760px]:grid-flow-col max-[760px]:gap-0">
      <IntentRouterLink
        v-for="section in sections"
        :id="`settings-${section.value}-link`"
        :key="section.value"
        :to="{ name: section.routeName }"
        :prefetch="section.prefetch"
        :class="[
          'flex h-10 w-full items-center rounded-[4px] px-3.5 text-left text-[.82rem] font-bold transition-[background,color] duration-[160ms] max-[760px]:justify-center max-[760px]:rounded-none max-[760px]:px-0',
          section.value === 'access' ? 'max-[760px]:border-l max-[760px]:border-line' : '',
          section.stateClasses,
        ]"
        :aria-current="section.active ? 'page' : undefined"
        :aria-controls="`settings-${section.value}-panel`"
      >
        <span>{{ section.label }}</span>
      </IntentRouterLink>
    </div>
  </PanelCard>
</template>
