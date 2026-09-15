<script setup lang="ts">
import { shallowRef, useTemplateRef, watch } from "vue";
import FormField from "@/components/ui/FormField.vue";

const props = defineProps<{
  label: string;
  error?: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  autofocus?: boolean;
  autocomplete?: "current-password" | "new-password";
}>();
const model = defineModel<string>({ default: "" });
const digits = shallowRef(Array.from({ length: 4 }, (_, index) => model.value[index] ?? ""));
const boxes = useTemplateRef<HTMLDivElement>("boxes");
watch(model, (value) => {
  if (value !== digits.value.join(""))
    digits.value = Array.from({ length: 4 }, (_, index) => value[index] ?? "");
});
function focusDigit(index: number): void {
  boxes.value?.querySelectorAll("input")[index]?.focus();
}
function writeDigits(index: number, value: string): void {
  if (!/^\d*$/.test(value)) return;
  const updated = [...digits.value];
  if (!value) updated[index] = "";
  else
    for (const [offset, digit] of value
      .slice(0, 4 - index)
      .split("")
      .entries())
      updated[index + offset] = digit;
  digits.value = updated;
  model.value = updated.join("");
  if (value) focusDigit(Math.min(index + value.length, 3));
}
function inputDigit(index: number, event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  writeDigits(index, input.value);
  input.value = digits.value[index]!;
}
function pasteDigits(index: number, event: ClipboardEvent): void {
  const value = event.clipboardData?.getData("text") ?? "";
  writeDigits(value.length === 4 ? 0 : index, value);
}
function keydown(index: number, event: KeyboardEvent): void {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    focusDigit(Math.max(0, Math.min(3, index + (event.key === "ArrowLeft" ? -1 : 1))));
  } else if (event.key === "Backspace" && !digits.value[index] && index > 0) {
    event.preventDefault();
    writeDigits(index - 1, "");
    focusDigit(index - 1);
  }
}
function selectDigit(event: FocusEvent): void {
  if (event.target instanceof HTMLInputElement) event.target.select();
}
</script>

<template>
  <FormField
    v-slot="field"
    :label="label"
    :error="error"
    :help-text="helpText"
    :required="required"
  >
    <div ref="boxes" role="group" :aria-label="label" class="flex gap-3">
      <input
        v-for="(digit, index) in digits"
        :id="index === 0 ? field.inputId : `${field.inputId}-${index}`"
        :key="index"
        :value="digit"
        :aria-label="`${label}, digit ${index + 1} of 4`"
        :aria-describedby="field.describedBy"
        :aria-invalid="field.invalid ? 'true' : undefined"
        :required="required || digits.some(Boolean)"
        :disabled="disabled"
        :autofocus="autofocus && index === 0"
        :autocomplete="props.autocomplete"
        type="password"
        inputmode="numeric"
        pattern="\d"
        maxlength="1"
        class="h-12 min-h-10 w-12 rounded-[7px] border bg-white text-center text-xl text-ink outline-none disabled:cursor-not-allowed disabled:opacity-55"
        :class="field.invalid ? 'border-clay focus:border-clay' : 'border-line focus:border-pine'"
        @input="inputDigit(index, $event)"
        @paste.prevent="pasteDigits(index, $event)"
        @keydown="keydown(index, $event)"
        @focus="selectDigit"
      />
    </div>
  </FormField>
</template>
