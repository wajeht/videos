<script setup lang="ts">
import { shallowRef } from "vue";
import type { ProfileDto } from "@/api.js";
import AppButton from "@/components/ui/AppButton.vue";
import ProfilePinField from "./ProfilePinField.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
defineProps<{ profile: ProfileDto; busy: boolean; pinError: string; error: string }>();
const emit = defineEmits<{ unlock: [pin: string]; cancel: [] }>();
const pin = shallowRef("");
</script>
<template>
  <form class="mx-auto grid max-w-sm gap-4 text-left" @submit.prevent="emit('unlock', pin)">
    <h1 class="text-xl font-bold">Unlock {{ profile.name }}</h1>
    <AlertMessage v-if="error">{{ error }}</AlertMessage>
    <ProfilePinField
      v-model="pin"
      label="Profile PIN"
      :error="pinError"
      :disabled="busy"
      autocomplete="current-password"
      required
      autofocus
    />
    <AppButton type="submit" :loading="busy">Unlock profile</AppButton>
    <AppButton variant="secondary" :disabled="busy" @click="emit('cancel')"
      >Back to profiles</AppButton
    >
  </form>
</template>
