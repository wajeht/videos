<script setup lang="ts">
import type { LibraryView } from "@/api.js";

withDefaults(defineProps<{ hideLabel?: boolean; name?: string }>(), {
  hideLabel: false,
  name: "library-playlist",
});
const emit = defineEmits<{ prefetch: [view: LibraryView] }>();
const selected = defineModel<LibraryView>({ required: true });
</script>

<template>
  <fieldset>
    <legend :class="hideLabel ? 'sr-only' : 'mb-3 text-[.72rem] font-extrabold text-ink'">
      View
    </legend>
    <ul class="space-y-2 text-[.86rem]">
      <li>
        <label
          class="flex cursor-pointer items-center gap-2.5 text-ink max-[760px]:min-h-11"
          @pointerenter="emit('prefetch', 'videos')"
        >
          <input
            v-model="selected"
            type="radio"
            :name="name"
            value="videos"
            class="h-4 w-4 border-line text-ink focus-visible:ring-belt-light"
            @focus="emit('prefetch', 'videos')"
            @pointerdown="emit('prefetch', 'videos')"
          />
          <span>All videos</span>
        </label>
      </li>
      <li>
        <label
          class="flex cursor-pointer items-center gap-2.5 text-ink max-[760px]:min-h-11"
          @pointerenter="emit('prefetch', 'playlists')"
        >
          <input
            v-model="selected"
            type="radio"
            :name="name"
            value="playlists"
            class="h-4 w-4 border-line text-ink focus-visible:ring-belt-light"
            @focus="emit('prefetch', 'playlists')"
            @pointerdown="emit('prefetch', 'playlists')"
          />
          <span>Playlists</span>
        </label>
      </li>
    </ul>
  </fieldset>
</template>
