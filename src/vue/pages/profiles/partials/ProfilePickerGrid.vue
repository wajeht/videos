<script setup lang="ts">
import type { ProfileDto } from "@/api.js";
import AppButton from "@/components/ui/AppButton.vue";
import ProfileAvatar from "./ProfileAvatar.vue";

defineProps<{
  profiles: readonly ProfileDto[];
  loading: boolean;
  disabled: boolean;
}>();
const emit = defineEmits<{ select: [profile: ProfileDto] }>();
</script>

<template>
  <div
    class="mt-8 flex flex-wrap items-start justify-center gap-6"
    :aria-busy="loading ? 'true' : undefined"
  >
    <template v-if="loading">
      <div
        v-for="index in 3"
        :key="index"
        class="grid w-40 animate-pulse justify-items-center gap-2 p-2 motion-reduce:animate-none"
        aria-hidden="true"
      >
        <div class="size-20 bg-pine" />
        <div class="h-[1lh] w-24 bg-mist" />
        <div class="h-[1lh] w-20 bg-mist text-sm" />
      </div>
    </template>
    <template v-else>
      <AppButton
        v-for="profile in profiles"
        :key="profile.id"
        class="grid w-40 cursor-pointer justify-items-center gap-2 border-0 bg-transparent p-2 hover:bg-transparent disabled:cursor-default"
        :disabled="disabled"
        @click="emit('select', profile)"
      >
        <ProfileAvatar :name="profile.name" />
        <span class="w-full break-words font-semibold text-link hover:underline">{{
          profile.name
        }}</span>
        <span class="text-sm text-muted"
          >{{ profile.role === "admin" ? "Admin · " : ""
          }}{{ profile.isLocked ? "Locked" : "Open" }}</span
        >
      </AppButton>
    </template>
  </div>
</template>
