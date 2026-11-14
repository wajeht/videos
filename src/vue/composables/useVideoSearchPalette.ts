import { useQuery } from "@tanstack/vue-query";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  readonly,
  shallowRef,
  watch,
} from "vue";
import { useRouter } from "vue-router";

import { apiErrorMessage } from "@/api.js";
import { useRoutePrefetch } from "@/composables/useRoutePrefetch.js";
import { videoSearchQueryOptions } from "@/queries.js";
import { playerLocation } from "@/router.js";

export function useVideoSearchPalette() {
  const router = useRouter();
  const prefetch = useRoutePrefetch();
  const open = shallowRef(false);
  const query = shallowRef("");
  const debouncedQuery = shallowRef("");
  const activeIndex = shallowRef(-1);
  const searchTerm = computed(() => query.value.trim());
  const searchStarted = computed(() => searchTerm.value.length >= 2);
  const searchReady = computed(
    () => searchStarted.value && debouncedQuery.value === searchTerm.value,
  );
  const request = useQuery(
    computed(() => videoSearchQueryOptions(debouncedQuery.value, open.value)),
  );
  const suggestions = computed(() => {
    if (!searchReady.value) return [];
    return request.data.value ?? [];
  });
  const activeResultId = computed(() => {
    const selected = suggestions.value[activeIndex.value];
    return selected ? `video-search-result-${selected.id}` : undefined;
  });
  const error = computed(() => {
    const caught = request.error.value;
    return caught ? apiErrorMessage(caught, "Could not search videos") : "";
  });
  const loading = computed(() => !searchReady.value || request.isFetching.value);

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  watch(searchTerm, (value) => {
    clearTimeout(searchTimer);
    activeIndex.value = -1;
    if (value.length < 2) {
      debouncedQuery.value = "";
      return;
    }
    searchTimer = setTimeout(() => {
      debouncedQuery.value = value;
    }, 150);
  });
  watch(suggestions, () => {
    activeIndex.value = -1;
  });
  onScopeDispose(() => clearTimeout(searchTimer));

  function closePalette(): void {
    open.value = false;
    query.value = "";
    debouncedQuery.value = "";
    activeIndex.value = -1;
  }

  function handleShortcut(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "k")
      return;
    event.preventDefault();
    if (open.value) closePalette();
    else open.value = true;
  }

  function activateResult(index: number): void {
    activeIndex.value = index;
  }

  function moveSelection(offset: number): void {
    if (!suggestions.value.length) return;
    const lastIndex = suggestions.value.length - 1;
    if (activeIndex.value < 0) activeIndex.value = offset > 0 ? 0 : lastIndex;
    else activeIndex.value = Math.min(lastIndex, Math.max(0, activeIndex.value + offset));
    const selected = suggestions.value[activeIndex.value];
    if (selected) void prefetch.video(selected.id).catch(() => undefined);
    void nextTick(() => {
      document.getElementById(activeResultId.value ?? "")?.scrollIntoView({ block: "nearest" });
    });
  }

  function submit(): void {
    const selected = suggestions.value[activeIndex.value];
    const submittedQuery = searchTerm.value;
    closePalette();
    if (selected) void router.push(playerLocation(selected.id, selected.playlistId));
    else if (submittedQuery) void router.push({ name: "videos", query: { q: submittedQuery } });
  }

  onMounted(() => document.addEventListener("keydown", handleShortcut));
  onBeforeUnmount(() => document.removeEventListener("keydown", handleShortcut));

  return {
    activateResult,
    activeIndex: readonly(activeIndex),
    activeResultId,
    closePalette,
    error,
    loading,
    moveSelection,
    open: readonly(open),
    query,
    searchStarted,
    submit,
    suggestions,
  };
}
