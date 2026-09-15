<script setup lang="ts">
import { shallowRef } from "vue";
import type { CreateProfileInput, ProfileDto } from "@/api.js";
import AppButton from "@/components/ui/AppButton.vue";
import AppInput from "@/components/ui/AppInput.vue";
import AppSelect from "@/components/ui/AppSelect.vue";
import FormField from "@/components/ui/FormField.vue";
import AlertMessage from "@/components/ui/AlertMessage.vue";
const props = defineProps<{
  profile: ProfileDto | null;
  admin: boolean;
  busy: boolean;
  error: string;
}>();
const emit = defineEmits<{ save: [input: CreateProfileInput]; cancel: [] }>();
const name = shallowRef(props.profile?.name ?? "");
const avatarKey = shallowRef<ProfileDto["avatarKey"]>(props.profile?.avatarKey ?? "pine");
const role = shallowRef<ProfileDto["role"]>(props.profile?.role ?? "member");
const password = shallowRef("");
</script>
<template>
  <form
    class="grid gap-4"
    @submit.prevent="emit('save', { name, avatarKey, role, password: password || null })"
  >
    <h2 class="text-xl font-bold">{{ profile ? `Edit ${profile.name}` : "Add profile" }}</h2>
    <AlertMessage v-if="error">{{ error }}</AlertMessage>
    <FormField v-slot="field" label="Profile name" required
      ><AppInput :id="field.inputId" v-model="name" maxlength="40" required
    /></FormField>
    <FormField v-slot="field" label="Avatar color"
      ><AppSelect :id="field.inputId" v-model="avatarKey"
        ><option
          v-for="color in ['pine', 'clay', 'gold', 'slate', 'sage', 'plum']"
          :key="color"
          :value="color"
        >
          {{ color }}
        </option></AppSelect
      ></FormField
    >
    <FormField
      v-if="admin"
      v-slot="field"
      label="Permissions"
      help-text="Admins manage profiles and the shared app password."
      ><AppSelect :id="field.inputId" v-model="role"
        ><option value="member">Member</option>
        <option value="admin">Admin</option></AppSelect
      ></FormField
    >
    <FormField
      v-if="!profile"
      v-slot="field"
      label="Profile password"
      :required="role === 'admin'"
      help-text="Use at least 8 characters. Optional for members."
      ><AppInput
        :id="field.inputId"
        v-model="password"
        type="password"
        autocomplete="new-password"
        minlength="8"
        maxlength="72"
        :required="role === 'admin'"
    /></FormField>
    <div class="flex gap-3">
      <AppButton type="submit" :loading="busy">{{
        profile ? "Save profile" : "Create profile"
      }}</AppButton
      ><AppButton variant="secondary" :disabled="busy" @click="emit('cancel')">Cancel</AppButton>
    </div>
  </form>
</template>
