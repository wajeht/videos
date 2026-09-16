<script setup lang="ts">
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import AppButton from "@/components/ui/AppButton.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { loadHomePage, loadVideosPage } from "@/router.js";

withDefaults(defineProps<{ standalone?: boolean }>(), {
  standalone: false,
});
</script>

<template>
  <main
    class="mx-auto grid w-[min(1380px,calc(100%-8vw))] place-items-center max-[860px]:w-[min(100%-40px,1380px)]"
    :class="standalone ? 'min-h-screen' : 'min-h-[calc(100vh-66px)]'"
  >
    <EmptyState
      title="Page not found"
      description="The address may be wrong, or the page may have moved."
      :heading-level="1"
      :framed="false"
    >
      <template #actions>
        <AppButton :as="IntentRouterLink" to="/" :prefetch="loadHomePage"> Go home </AppButton>
        <AppButton
          v-if="!standalone"
          :as="IntentRouterLink"
          to="/videos"
          :prefetch="loadVideosPage"
        >
          Browse videos
        </AppButton>
      </template>
    </EmptyState>
  </main>
</template>
