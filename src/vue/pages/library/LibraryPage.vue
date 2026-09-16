<script setup lang="ts">
import { computed } from "vue";

import AlertMessage from "@/components/ui/AlertMessage.vue";
import AppButton from "@/components/ui/AppButton.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import PaginationControls from "@/components/ui/PaginationControls.vue";
import PlaylistGrid from "@/components/PlaylistGrid.vue";
import VideoGrid from "@/components/VideoGrid.vue";
import { useLibraryBrowser } from "@/composables/useLibraryBrowser.js";
import { useLibraryPageSize } from "@/composables/useLibraryPageSize.js";
import { useMediaQuery } from "@/composables/useMediaQuery.js";
import StandardPageLayout from "@/layouts/StandardPageLayout.vue";
import LibraryFiltersToolbar from "@/pages/library/partials/LibraryFiltersToolbar.vue";

const isMobile = useMediaQuery("(max-width: 600px)");
const {
  disabled: pageSizeDisabled,
  error: pageSizeError,
  libraryPageSize,
  pageSizeOverride,
  setLibraryPageSize,
} = useLibraryPageSize();
const {
  canLoadMore,
  clearFilters,
  error,
  hasActiveFilters,
  library,
  loadedVideos,
  loadMore,
  loadMoreError,
  loading,
  loadingMore,
  page,
  prefetchFilter,
  prefetchPage,
  prefetchPageSize,
  prefetchView,
  query,
  refreshing,
  selectedAuthor,
  selectedTag,
  selectedView,
  setPage,
} = useLibraryBrowser({ accumulatePages: isMobile, pageSize: pageSizeOverride });
const displayedVideos = computed(() =>
  isMobile.value ? loadedVideos.value : library.value.videos,
);
</script>

<template>
  <StandardPageLayout>
    <AlertMessage v-if="error" class="mb-7" size="lg">{{ error }}</AlertMessage>
    <section :aria-busy="refreshing">
      <PageHeader
        eyebrow="Your archive"
        :title="selectedView === 'playlists' ? 'Playlists' : 'All videos'"
        :heading-level="1"
      />
      <div
        data-testid="library-layout"
        class="sidebar-layout mt-6 grid items-start max-[760px]:mt-1 max-[760px]:grid-cols-1 max-[760px]:gap-1"
      >
        <LibraryFiltersToolbar
          v-model:author="selectedAuthor"
          v-model:query="query"
          v-model:tag="selectedTag"
          v-model:view="selectedView"
          class="sidebar-column sticky top-[90px] max-h-[calc(100dvh-114px)] max-[760px]:top-[calc(66px+env(safe-area-inset-top))] max-[760px]:z-30 max-[760px]:-mx-5 max-[760px]:max-h-none max-[760px]:overflow-visible max-[760px]:bg-porcelain max-[760px]:p-5"
          data-testid="library-filter-column"
          :authors="library.authors"
          :has-active-filters="hasActiveFilters"
          :page-size="libraryPageSize"
          :page-size-disabled="pageSizeDisabled"
          :page-size-error="pageSizeError"
          :tags="library.tags"
          @clear="clearFilters"
          @prefetch="prefetchFilter"
          @prefetch-page-size="prefetchPageSize"
          @prefetch-view="prefetchView"
          @update:page-size="setLibraryPageSize"
        />
        <div class="min-w-0">
          <PlaylistGrid
            v-if="selectedView === 'playlists' && library.playlists.length"
            :playlists="library.playlists"
          />
          <VideoGrid
            v-else-if="selectedView === 'videos' && (loading || displayedVideos.length)"
            :videos="displayedVideos"
            :loading="loading"
          />
          <EmptyState
            v-else-if="!loading"
            :title="
              selectedView === 'playlists'
                ? 'No playlists match these filters'
                : hasActiveFilters
                  ? 'No videos match these filters'
                  : 'No videos found'
            "
            :description="
              selectedView === 'playlists'
                ? 'Try another author, tag, or search term.'
                : hasActiveFilters
                  ? 'Try another author, tag, or search term.'
                  : 'Add a video to your videos folder, then refresh the library.'
            "
          >
            <template v-if="!hasActiveFilters" #details
              >Server folder: <code>/videos</code></template
            >
          </EmptyState>
          <PaginationControls
            v-if="selectedView === 'videos' && !loading"
            class="mt-8 max-[600px]:hidden"
            :disabled="refreshing"
            :page="page"
            :total-pages="library.pagination.totalPages"
            @change="setPage"
            @prefetch="prefetchPage"
          />
          <AlertMessage
            v-if="selectedView === 'videos' && loadMoreError"
            class="mt-[18px] hidden max-[600px]:block"
          >
            {{ loadMoreError }}
          </AlertMessage>
          <div
            v-if="selectedView === 'videos' && canLoadMore"
            class="mt-[18px] hidden max-[600px]:block"
          >
            <AppButton
              block
              data-testid="load-more-videos"
              :loading="loadingMore"
              loading-label="Loading more…"
              @click="loadMore"
            >
              Load more
            </AppButton>
          </div>
        </div>
      </div>
    </section>
  </StandardPageLayout>
</template>
