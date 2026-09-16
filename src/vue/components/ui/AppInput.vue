<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    invalid?: boolean;
    revealable?: boolean;
    type?: string;
  }>(),
  {
    disabled: false,
    invalid: false,
    revealable: true,
    type: "text",
  },
);

const model = defineModel<string>({ default: "" });
const input = useTemplateRef<HTMLInputElement>("input");
const revealed = shallowRef(false);
const canReveal = computed(
  () => props.type === "password" && props.revealable && model.value.length > 0,
);
const actualType = computed(() => (canReveal.value && revealed.value ? "text" : props.type));
watch(model, (value) => {
  if (!value) revealed.value = false;
});

defineExpose({
  blur: () => input.value?.blur(),
  focus: () => input.value?.focus(),
  input,
});
</script>

<template>
  <div class="relative w-full">
    <input
      ref="input"
      v-model="model"
      v-bind="$attrs"
      :type="actualType"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      :class="['w-full min-w-0', canReveal ? 'pr-12' : '', invalid ? 'border-clay' : '']"
    />
    <button
      v-if="canReveal"
      class="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center border-0 bg-transparent"
      type="button"
      :aria-label="revealed ? 'Hide password' : 'Show password'"
      @click="revealed = !revealed"
    >
      <svg
        v-if="revealed"
        data-icon="eye-off"
        class="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395"
        />
        <path
          d="M17.882 17.882A10.451 10.451 0 0 0 22.066 12C20.774 7.662 16.756 4.5 12 4.5c-.868 0-1.71.107-2.515.309"
        />
        <path d="M6.228 6.228 17.772 17.772" />
        <path d="M9.88 9.88a3 3 0 1 0 4.243 4.243" />
      </svg>
      <svg
        v-else
        data-icon="eye"
        class="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"
        />
        <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    </button>
  </div>
</template>
