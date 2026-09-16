<script setup lang="ts">
import { shallowRef } from "vue";
import type { ProfileDto } from "@/api.js";
import AppInput from "@/components/ui/AppInput.vue";
import FormField from "@/components/ui/FormField.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
defineProps<{ profile: ProfileDto; busy: boolean; passwordError: string; error: string }>();
const emit = defineEmits<{ unlock: [password: string]; cancel: [] }>();
const password = shallowRef("");
</script>
<template>
  <form class="mx-auto grid max-w-sm gap-4 text-left" @submit.prevent="emit('unlock', password)">
    <h1>Unlock {{ profile.name }}</h1>
    <AlertMessage v-if="error">{{ error }}</AlertMessage>
    <FormField v-slot="field" label="Profile password" :error="passwordError" required>
      <AppInput
        :id="field.inputId"
        v-model="password"
        :aria-describedby="field.describedBy"
        :invalid="field.invalid"
        :disabled="busy"
        type="password"
        autocomplete="current-password"
        maxlength="72"
        required
        autofocus
      />
    </FormField>
    <div class="grid grid-cols-2 gap-3">
      <AppButton :disabled="busy" @click="emit('cancel')">Back to profiles</AppButton>
      <AppButton type="submit" :loading="busy">Unlock profile</AppButton>
    </div>
  </form>
</template>
