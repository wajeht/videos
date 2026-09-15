<script setup lang="ts">
import { useAuth } from "@/composables/useAuth.js";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import SettingsAccessPanel from "@/pages/settings/partials/SettingsAccessPanel.vue";
import SettingsLayout from "@/pages/settings/partials/SettingsLayout.vue";

const auth = useAuth();
</script>

<template>
  <NotFoundPage v-if="auth.state.profile?.role !== 'admin'" />
  <SettingsLayout v-else>
    <section id="settings-access-panel" class="min-w-0" aria-labelledby="settings-access-link">
      <SettingsAccessPanel />
    </section>
  </SettingsLayout>
</template>
