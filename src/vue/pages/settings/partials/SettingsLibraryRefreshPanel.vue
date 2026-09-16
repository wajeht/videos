<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";

import { api, apiErrorMessage } from "@/api.js";
import AlertMessage from "@/components/ui/AlertMessage.vue";
import AppButton from "@/components/ui/AppButton.vue";
import PanelCard from "@/components/ui/PanelCard.vue";
import PanelCardHeader from "@/components/ui/PanelCardHeader.vue";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import { useAuth } from "@/composables/useAuth.js";
import { useToast } from "@/composables/useToast.js";
import { queryKeys, scanStatusQueryOptions } from "@/queries.js";
import { countText } from "@/utils.js";

const auth = useAuth();
const queryClient = useQueryClient();
const scanRequest = useQuery(scanStatusQueryOptions());
const toast = useToast();
const scanStatus = computed(() => scanRequest.data.value);
const loadingScanStatus = computed(() => scanRequest.isPending.value);
const lastRefreshText = computed(() => {
  const completedAt = scanStatus.value?.completedAt;
  if (!completedAt) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(completedAt));
});
const rescanAction = useAsyncAction(() => api.rescanLibrary(), {
  errorMessage: "Could not refresh the library",
  onSuccess: async (status) => {
    queryClient.setQueryData(queryKeys.scanStatus, status);
    await queryClient.invalidateQueries({ queryKey: queryKeys.library, refetchType: "none" });
    if (status.status === "complete") toast.success("Library refreshed");
  },
});
const refreshing = computed(
  () => rescanAction.pending.value || scanStatus.value?.status === "scanning",
);
const scanError = computed(() => {
  if (rescanAction.errorMessage.value) return rescanAction.errorMessage.value;
  if (scanStatus.value?.status === "failed") {
    return "The library could not be refreshed. Check that your video folder is available, then try again.";
  }
  const caught = scanRequest.error.value;
  if (!caught) return "";
  return apiErrorMessage(caught, "Could not load library status");
});
const libraryStatusText = computed(() => {
  if (scanStatus.value?.status === "failed") return "Refresh failed";
  if (scanRequest.error.value) return "Library status unavailable";
  if (scanStatus.value?.status === "scanning") return "Refreshing library…";
  if (scanStatus.value?.completedAt) {
    return scanStatus.value.warnings.length
      ? countText(scanStatus.value.warnings.length, "library issue")
      : `${countText(scanStatus.value.playlistCount, "playlist")} · ${countText(scanStatus.value.videoCount, "video")}`;
  }
  if (scanRequest.isPending.value) return "Library status is loading…";
  return "Library has not been refreshed yet";
});

async function rescanLibrary(): Promise<void> {
  await rescanAction.run();
}
</script>

<template>
  <AlertMessage v-if="scanError" size="lg">
    {{ scanError }}
  </AlertMessage>

  <PanelCard class="min-h-[260px]">
    <PanelCardHeader
      title="Refresh library"
      description="Check your videos folder now for new or changed videos and playlists."
    />
    <div
      class="flex min-h-[180px] flex-col items-start justify-between gap-8 p-[clamp(22px,4vw,34px)]"
      data-scan-controls
    >
      <div class="min-w-0">
        <div
          class="grid gap-6"
          :aria-busy="loadingScanStatus ? 'true' : undefined"
          aria-live="polite"
        >
          <span v-if="loadingScanStatus" class="sr-only">Loading library status</span>
          <div data-library-status>
            <p>Library status</p>
            <p
              v-if="loadingScanStatus"
              class="mt-2 h-[1lh] w-44 max-w-full animate-pulse bg-mist motion-reduce:animate-none"
              aria-hidden="true"
              data-library-status-skeleton
            />
            <p
              v-else
              class="mt-2"
              :class="{
                'font-semibold text-clay-ink': scanStatus?.status === 'failed',
                'font-semibold text-link':
                  scanStatus?.status !== 'failed' && Boolean(scanStatus?.warnings.length),
                'text-muted': scanStatus?.status !== 'failed' && !scanStatus?.warnings.length,
              }"
            >
              {{ libraryStatusText }}
            </p>
            <p
              v-if="
                scanStatus?.status !== 'failed' &&
                scanStatus?.completedAt &&
                scanStatus.warnings.length
              "
              class="mt-1.5"
            >
              {{ countText(scanStatus.playlistCount, "playlist") }} ·
              {{ countText(scanStatus.videoCount, "video") }}
            </p>
          </div>

          <div v-if="loadingScanStatus || scanStatus?.completedAt" data-last-refresh>
            <p>
              <template v-if="scanStatus?.status === 'failed'">Last refresh attempt</template>
              <template v-else>Last refreshed</template>
            </p>
            <div
              v-if="loadingScanStatus"
              class="mt-2 h-[1lh] w-36 max-w-full animate-pulse bg-mist motion-reduce:animate-none"
              aria-hidden="true"
              data-last-refresh-skeleton
            />
            <time
              v-else-if="scanStatus?.completedAt"
              class="mt-2 block"
              :datetime="scanStatus.completedAt"
            >
              {{ lastRefreshText }}
            </time>
          </div>
        </div>
        <div v-if="scanStatus?.warnings.length" class="mt-5 border border-link/25 bg-link/10 p-4">
          <p>Review these files, correct each listed problem, then refresh the library.</p>
          <ul class="mt-3 grid gap-3" aria-label="Library issues">
            <li
              v-for="warning in scanStatus.warnings"
              :key="`${warning.path}:${warning.message}`"
              class="grid gap-1"
            >
              <code class="break-all">{{ warning.path }}</code>
              <span>{{ warning.message }}</span>
            </li>
          </ul>
        </div>
      </div>
      <AppButton
        v-if="auth.state.profile?.role === 'admin'"
        class="self-end max-[600px]:w-full"
        :loading="refreshing"
        loading-label="Refreshing…"
        @click="rescanLibrary"
      >
        Refresh library
      </AppButton>
    </div>
  </PanelCard>
</template>
