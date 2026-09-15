<script setup lang="ts">
import { useAuth } from "@/composables/useAuth.js";
import { useAsyncAction } from "@/composables/useAsyncAction.js";
import { useToast } from "@/composables/useToast.js";
const auth = useAuth();
const toast = useToast();
const action = useAsyncAction(() => auth.clearProfile(), {
  onError: () => toast.error("Could not switch profiles"),
});
</script>
<template>
  <button
    class="max-w-40 truncate rounded-md border border-white/25 px-3 py-2 text-sm font-bold hover:bg-white/10"
    :disabled="action.pending.value"
    aria-label="Switch profile"
    @click="action.run()"
  >
    {{ auth.state.profile?.name }} <span aria-hidden="true">⇄</span>
  </button>
</template>
