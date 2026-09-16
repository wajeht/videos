<script setup lang="ts">
import type { LibraryDto } from "@/api.js";
import AppButton from "@/components/ui/AppButton.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import IntentRouterLink from "@/components/IntentRouterLink.vue";
import VideoGrid from "@/components/VideoGrid.vue";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";

defineProps<{ videos: LibraryDto["continueWatching"]; loading: boolean }>();
const prefetch = useRoutePrefetch();
</script>

<template>
  <section>
    <PageHeader class="mb-6" eyebrow="Home" title="Continue watching" :heading-level="1" />
    <VideoGrid v-if="loading || videos.length" :videos="videos" :loading="loading" />
    <EmptyState
      v-else
      title="Nothing in progress"
      description="Start a video and it will appear here."
      :heading-level="2"
    >
      <template #actions>
        <AppButton :as="IntentRouterLink" to="/videos" :prefetch="prefetch.videos"
          >Browse videos</AppButton
        >
      </template>
    </EmptyState>
  </section>
</template>
