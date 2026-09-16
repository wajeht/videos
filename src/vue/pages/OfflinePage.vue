<script setup lang="ts">
import AppButton from "@/components/ui/AppButton.vue";
import AppLogo from "@/components/ui/AppLogo.vue";

defineEmits<{ retry: [] }>();
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-porcelain px-5 py-10">
    <section class="w-full max-w-[760px] overflow-hidden border border-line bg-surface">
      <header class="bg-canvas px-7 py-6 sm:px-9">
        <AppLogo />
        <p class="mt-3">Your Videos server can’t be reached right now.</p>
      </header>

      <div class="px-7 py-8 sm:px-9 sm:py-9">
        <p>Connection unavailable</p>
        <h1 class="mt-2">Videos can’t connect</h1>
        <p class="mt-3 max-w-xl">
          Make sure this device is online and your Videos server is running, then try again.
        </p>

        <AppButton class="mt-7 max-[560px]:w-full" @click="$emit('retry')"> Try again </AppButton>
      </div>
    </section>
  </main>
</template>
