<script setup lang="ts">
const appVersion = __APP_VERSION__;
</script>

<template>
  <footer class="text-center">
    © 2026 · Made by
    <a
      class="underline-offset-4 hover:underline"
      href="https://github.com/wajeht"
      target="_blank"
      rel="noreferrer"
      aria-label="App author on GitHub (opens in a new tab)"
      >@wajeht</a
    >
    .
    <a
      class="underline-offset-4 hover:underline"
      :href="`https://github.com/wajeht/videos/releases/tag/v${appVersion}`"
      target="_blank"
      rel="noreferrer"
      :aria-label="`View release v${appVersion} on GitHub (opens in a new tab)`"
      >v{{ appVersion }}
    </a>
  </footer>
</template>
