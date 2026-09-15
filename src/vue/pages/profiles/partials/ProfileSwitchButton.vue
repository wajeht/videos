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
    type="button"
    class="max-w-32 truncate border-b-2 border-transparent px-0 py-2 text-[.76rem] font-bold tracking-[.14em] uppercase text-white/55 hover:text-white/90 min-[861px]:max-w-40"
    :disabled="action.pending.value"
    aria-label="Switch profile"
    @click="action.run()"
  >
    {{ auth.state.profile?.name }}
  </button>
</template>
