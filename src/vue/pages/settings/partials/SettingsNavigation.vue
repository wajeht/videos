<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import IntentRouterLink from "@/components/IntentRouterLink.vue";
import FormSection from "@/components/ui/FormSection.vue";
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
    <FormSection title="Settings">
      <ul
        class="m-0 list-none p-0 max-[760px]:grid max-[760px]:auto-cols-fr max-[760px]:grid-flow-col"
      >
        <li v-for="(section, index) in sections" :key="section.value">
          <IntentRouterLink
            :id="`settings-${section.value}-link`"
            :to="{ name: section.routeName }"
            :prefetch="section.prefetch"
            :class="['block max-[760px]:py-2 max-[760px]:text-center', section.stateClasses]"
            :aria-current="section.active ? 'page' : undefined"
            :aria-controls="`settings-${section.value}-panel`"
          >
            {{ section.label }}
          </IntentRouterLink>
          <hr
            v-if="index < sections.length - 1"
            aria-hidden="true"
            class="my-[15px] border-0 border-t border-solid border-line max-[760px]:hidden"
          />
        </li>
      </ul>
    </FormSection>
  </nav>
</template>
