<script setup lang="ts">
defineProps<{
  hasQuery: boolean;
  selected: boolean;
}>();
</script>

<template>
  <footer class="flex items-center gap-5 border-t border-line px-5 py-3 max-[600px]:hidden">
    <span><kbd>↑↓</kbd> Navigate</span>
    <span v-if="hasQuery">
      <kbd>Enter</kbd>
      {{ selected ? "Open" : "View all results" }}
    </span>
    <span v-else>Type 2+ characters to search</span>
    <span class="ml-auto"><kbd>Esc</kbd> Close</span>
  </footer>
</template>
