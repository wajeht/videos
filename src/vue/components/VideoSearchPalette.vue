<script setup lang="ts">
import VideoSearchFooter from "@/components/VideoSearchFooter.vue";
import VideoSearchResults from "@/components/VideoSearchResults.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AppInput from "@/components/ui/AppInput.vue";
import { useModalDialog } from "@/composables/useModalDialog.js";
import { useVideoSearchPalette } from "@/composables/useVideoSearchPalette.js";

const {
  activateResult,
  activeIndex,
  activeResultId,
  closePalette,
  error,
  loading,
  moveSelection,
  open,
  query,
  searchStarted,
  submit,
  suggestions,
} = useVideoSearchPalette();
const { handleBackdrop, handleCancel } = useModalDialog(() => open.value, closePalette);
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      aria-label="Search videos"
      class="mx-auto mt-[12vh] max-h-[min(640px,76vh)] w-[min(720px,calc(100%-40px))] overflow-hidden rounded-[12px] border border-line bg-surface p-0 text-ink shadow-[0_24px_80px_rgb(18_22_28_/_36%)] backdrop:bg-pine-deep/45 max-[600px]:mt-[max(12px,env(safe-area-inset-top))]"
      @cancel="handleCancel"
      @click="handleBackdrop"
    >
      <section @click.stop>
        <form @submit.prevent="submit">
          <div class="flex items-center gap-3 border-b border-line px-5 py-3 max-[600px]:px-4">
            <AppInput
              v-model="query"
              variant="bare"
              class="h-10 text-base"
              aria-label="Search videos, authors, playlists, and tags"
              aria-controls="video-search-results"
              :aria-activedescendant="activeResultId"
              :aria-expanded="searchStarted"
              aria-autocomplete="list"
              autocomplete="off"
              autofocus
              placeholder="Search videos, authors, playlists, and tags"
              role="combobox"
              @keydown.down.prevent="moveSelection(1)"
              @keydown.up.prevent="moveSelection(-1)"
            />
            <AppButton
              variant="secondary"
              size="sm"
              class="shrink-0 text-[.68rem]"
              aria-label="Close search"
              @click="closePalette"
            >
              <span class="max-[600px]:hidden">Esc</span>
              <span class="hidden max-[600px]:inline">Close</span>
            </AppButton>
          </div>

          <VideoSearchResults
            :active-index="activeIndex"
            :error
            :loading
            :query
            :started="searchStarted"
            :videos="suggestions"
            @activate="activateResult"
            @close="closePalette"
          />

          <VideoSearchFooter :has-query="Boolean(query.trim())" :selected="activeIndex >= 0" />
        </form>
      </section>
    </dialog>
  </Teleport>
</template>
