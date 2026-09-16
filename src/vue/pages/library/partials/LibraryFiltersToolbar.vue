<script setup lang="ts">
import { computed, shallowRef } from "vue";

import type { LibraryDto, LibraryPageSize, LibraryView } from "@/api.js";
import AppButton from "@/components/ui/AppButton.vue";
import AppDrawer from "@/components/ui/AppDrawer.vue";
import AppInput from "@/components/ui/AppInput.vue";
import PanelCard from "@/components/ui/PanelCard.vue";
import LibraryFilterGroup from "@/pages/library/partials/LibraryFilterGroup.vue";
import LibraryPageSizeFilter from "@/pages/library/partials/LibraryPageSizeFilter.vue";
import LibraryPlaylistFilter from "@/pages/library/partials/LibraryPlaylistFilter.vue";

type FilterType = "author" | "pageSize" | "tag" | "view";

const props = defineProps<{
  authors: LibraryDto["authors"];
  hasActiveFilters: boolean;
  pageSizeDisabled?: boolean;
  pageSizeError?: string;
  tags: LibraryDto["tags"];
}>();
const emit = defineEmits<{
  clear: [];
  prefetch: [name: "author" | "tag", selection: string[]];
  prefetchPageSize: [pageSize: LibraryPageSize];
  prefetchView: [view: LibraryView];
}>();
const author = defineModel<string[]>("author", { required: true });
const query = defineModel<string>("query", { required: true });
const tag = defineModel<string[]>("tag", { required: true });
const view = defineModel<LibraryView>("view", { required: true });
const pageSize = defineModel<LibraryPageSize>("pageSize", { required: true });

const activeMobilePanel = shallowRef<FilterType | null>(null);
const mobilePanelTitle = computed(() => {
  if (activeMobilePanel.value === "author") return "Authors";
  if (activeMobilePanel.value === "pageSize") return "Videos per page";
  if (activeMobilePanel.value === "tag") return "Tags";
  return "View";
});
const mobileFilterButtons = computed(() => [
  {
    active: true,
    label: view.value === "playlists" ? "Playlists" : "All videos",
    type: "view" as const,
  },
  {
    active: author.value.length > 0,
    label: selectionLabel("Authors", author.value),
    type: "author" as const,
  },
  { active: tag.value.length > 0, label: selectionLabel("Tags", tag.value), type: "tag" as const },
  {
    active: false,
    label: `${pageSize.value} per page`,
    type: "pageSize" as const,
  },
]);
const mobilePanelValue = computed({
  get: () => {
    if (activeMobilePanel.value === "author") return author.value;
    if (activeMobilePanel.value === "tag") return tag.value;
    return [];
  },
  set: (values: string[]) => {
    if (activeMobilePanel.value === "author") author.value = values;
    if (activeMobilePanel.value === "tag") tag.value = values;
  },
});

function selectionLabel(label: string, values: string[]): string {
  if (values.length === 1) return `${label}: ${values[0]}`;
  if (values.length > 1) return `${label} (${values.length})`;
  return label;
}

function togglePanel(panel: FilterType): void {
  activeMobilePanel.value = activeMobilePanel.value === panel ? null : panel;
}
</script>

<template>
  <div>
    <aside class="grid gap-4 max-[760px]:hidden">
      <AppInput
        v-model="query"
        :aria-label="view === 'playlists' ? 'Search playlists' : 'Search videos'"
        :placeholder="view === 'playlists' ? 'Search playlists' : 'Search videos'"
        type="search"
      />
      <AppButton v-if="hasActiveFilters" class="justify-self-start underline" @click="emit('clear')"
        >Clear filters</AppButton
      >
      <PanelCard>
        <LibraryPlaylistFilter
          v-model="view"
          name="library-desktop-view"
          @prefetch="emit('prefetchView', $event)"
        />
      </PanelCard>
      <PanelCard>
        <LibraryFilterGroup
          v-model="author"
          all-label="No authors"
          label="Authors"
          name="library-desktop-author"
          :options="authors"
          @prefetch="emit('prefetch', 'author', $event)"
        />
      </PanelCard>
      <PanelCard>
        <LibraryFilterGroup
          v-model="tag"
          all-label="No tags"
          label="Tags"
          name="library-desktop-tag"
          :options="tags"
          @prefetch="emit('prefetch', 'tag', $event)"
        />
      </PanelCard>
      <PanelCard>
        <LibraryPageSizeFilter
          v-model="pageSize"
          :disabled="pageSizeDisabled"
          :error="pageSizeError"
          name="library-desktop-page-size"
          @prefetch="emit('prefetchPageSize', $event)"
        />
      </PanelCard>
    </aside>

    <div class="hidden max-[760px]:block">
      <AppInput
        v-model="query"
        data-testid="mobile-library-search"
        :aria-label="view === 'playlists' ? 'Search playlists' : 'Search videos'"
        class="mb-3"
        :placeholder="view === 'playlists' ? 'Search playlists' : 'Search videos'"
        type="search"
      />
      <div data-testid="mobile-filter-actions" class="flex flex-wrap gap-2">
        <AppButton
          v-for="button in mobileFilterButtons"
          :key="button.type"
          :aria-expanded="activeMobilePanel === button.type"
          :aria-pressed="button.active"
          :data-mobile-filter="button.type"
          @click="togglePanel(button.type)"
        >
          {{ button.label }}
        </AppButton>
        <AppButton
          v-if="props.hasActiveFilters"
          data-clear-filters="mobile"
          class="inline-flex min-h-9 items-center underline"
          @click="emit('clear')"
        >
          Clear filters
        </AppButton>
      </div>
    </div>

    <AppDrawer
      v-if="activeMobilePanel"
      :open="true"
      :title="mobilePanelTitle"
      :close-label="`Close ${mobilePanelTitle.toLowerCase()} filters`"
      @close="activeMobilePanel = null"
    >
      <LibraryPlaylistFilter
        v-if="activeMobilePanel === 'view'"
        v-model="view"
        hide-label
        name="library-mobile-view"
        @prefetch="emit('prefetchView', $event)"
      />
      <LibraryFilterGroup
        v-else-if="activeMobilePanel === 'author'"
        v-model="mobilePanelValue"
        all-label="No authors"
        hide-label
        label="Authors"
        name="library-mobile-author"
        :options="props.authors"
        @prefetch="emit('prefetch', 'author', $event)"
      />
      <LibraryPageSizeFilter
        v-else-if="activeMobilePanel === 'pageSize'"
        v-model="pageSize"
        hide-label
        :disabled="pageSizeDisabled"
        :error="pageSizeError"
        name="library-mobile-page-size"
        @prefetch="emit('prefetchPageSize', $event)"
      />
      <LibraryFilterGroup
        v-else
        v-model="mobilePanelValue"
        all-label="No tags"
        hide-label
        label="Tags"
        name="library-mobile-tag"
        :options="props.tags"
        @prefetch="emit('prefetch', 'tag', $event)"
      />
    </AppDrawer>
  </div>
</template>
