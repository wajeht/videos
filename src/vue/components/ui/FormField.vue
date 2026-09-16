<script setup lang="ts">
import { computed, useId } from "vue";

const props = defineProps<{
  error?: string;
  helpText?: string;
  id?: string;
  label: string;
  required?: boolean;
}>();

const generatedId = useId();
const inputId = computed(() => props.id ?? `field-${generatedId}`);
const helpId = computed(() => (props.helpText ? `${inputId.value}-help` : undefined));
const errorId = computed(() => (props.error ? `${inputId.value}-error` : undefined));
const describedBy = computed(() => [helpId.value, errorId.value].filter(Boolean).join(" "));
</script>

<template>
  <div>
    <label :for="inputId" class="block">
      {{ label }}<span v-if="required" class="text-clay-ink" aria-hidden="true"> *</span>
    </label>
    <div class="mt-2">
      <slot
        :input-id="inputId"
        :described-by="describedBy || undefined"
        :invalid="Boolean(error)"
      />
    </div>
    <p v-if="helpText" :id="helpId" class="mt-1.5">
      {{ helpText }}
    </p>
    <p v-if="error" :id="errorId" class="mt-1.5 text-clay-ink" role="alert">
      {{ error }}
    </p>
  </div>
</template>
