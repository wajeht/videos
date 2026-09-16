<script setup lang="ts">
import { computed } from "vue";

import PlaylistGrid from "@/components/PlaylistGrid.vue";
import VideoGrid from "@/components/VideoGrid.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
import AppButton from "@/components/ui/AppButton.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import PaginationControls from "@/components/ui/PaginationControls.vue";
import { useAuthorLibrary } from "@/composables/useAuthorLibrary.js";
import { useMediaQuery } from "@/composables/useMediaQuery.js";
import StandardPageLayout from "@/layouts/StandardPageLayout.vue";

const isMobile = useMediaQuery("(max-width: 600px)");
const {
  author,
  authorName,
  canLoadMore,
  error,
  library,
  loadedPlaylists,
  loadedVideos,
  loading,
  loadingMore,
  loadMore,
  loadMoreError,
  page,
  prefetchPage,
  refreshing,
  setPage,
} = useAuthorLibrary(isMobile);
const displayedVideos = computed(() =>
  isMobile.value ? loadedVideos.value : (library.value?.videos ?? []),
);
</script>

<template>
  <StandardPageLayout>
    <AlertMessage v-if="error" class="mb-7" size="lg">{{ error }}</AlertMessage>
    <section :aria-busy="refreshing">
      <PageHeader eyebrow="Author" :title="author?.name ?? authorName" :heading-level="1" />

      <section v-if="loadedPlaylists.length" class="mt-12">
        <PageHeader class="mb-6" eyebrow="Collections" title="Playlists" :heading-level="2" />
        <PlaylistGrid :playlists="loadedPlaylists" />
      </section>

      <section class="mt-12">
        <PageHeader class="mb-6" eyebrow="Archive" title="Videos" :heading-level="2" />
        <VideoGrid
          v-if="loading || displayedVideos.length"
          :videos="displayedVideos"
          :loading="loading"
        />
        <EmptyState
          v-else-if="author"
          title="No videos found"
          :description="`No videos are currently credited to ${author.name}.`"
        />
        <PaginationControls
          v-if="library && !loading"
          class="mt-8 max-[600px]:hidden"
          :disabled="refreshing"
          :page="page"
          :total-pages="library.pagination.totalPages"
          @change="setPage"
          @prefetch="prefetchPage"
        />
        <AlertMessage v-if="loadMoreError" class="mt-[18px] hidden max-[600px]:block">
          {{ loadMoreError }}
        </AlertMessage>
        <div v-if="canLoadMore" class="mt-[18px] hidden max-[600px]:block">
          <AppButton
            block
            data-testid="load-more-author-videos"
            :loading="loadingMore"
            loading-label="Loading more…"
            @click="loadMore"
          >
            Load more
          </AppButton>
        </div>
      </section>
    </section>
  </StandardPageLayout>
</template>
