<script setup lang="ts">
import { shallowRef } from "vue";
import type { CreateProfileInput, ProfileDto } from "@/api.js";
import PanelCard from "@/components/ui/PanelCard.vue";
import PanelCardHeader from "@/components/ui/PanelCardHeader.vue";
import AppButton from "@/components/ui/AppButton.vue";
import AppInput from "@/components/ui/AppInput.vue";
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
const password = shallowRef("");
</script>
<template>
  <PanelCard :elevated="false" padding="none">
    <PanelCardHeader
      :title="profile ? (admin ? `Edit ${profile.name}` : 'Profile details') : 'Add profile'"
    />
    <form
      class="grid gap-4 p-[clamp(22px,4vw,34px)]"
      @submit.prevent="emit('save', { name, password: password || null })"
    >
      <AlertMessage v-if="error">{{ error }}</AlertMessage>
      <FormField v-slot="field" label="Profile name" required
        ><AppInput :id="field.inputId" v-model="name" maxlength="40" required
      /></FormField>
      <FormField
        v-if="!profile"
        v-slot="field"
        label="Profile password"
        help-text="Use at least 8 characters. Optional for members."
      >
        <AppInput
          :id="field.inputId"
          v-model="password"
          :aria-describedby="field.describedBy"
          :invalid="field.invalid"
          :disabled="busy"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="72"
        />
      </FormField>
      <div
        class="mt-4 flex flex-wrap justify-end gap-3 max-[600px]:grid max-[600px]:auto-cols-fr max-[600px]:grid-flow-col"
      >
        <AppButton v-if="admin" variant="secondary" :disabled="busy" @click="emit('cancel')">
          Cancel
        </AppButton>
        <AppButton type="submit" :loading="busy">{{
          profile ? "Save profile" : "Create profile"
        }}</AppButton>
      </div>
    </form>
  </PanelCard>
</template>
