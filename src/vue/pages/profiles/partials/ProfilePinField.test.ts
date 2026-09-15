// @vitest-environment happy-dom
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ProfilePinField from "./ProfilePinField.vue";

let wrapper: VueWrapper;
afterEach(() => wrapper.unmount());
function mountField(required = true) {
  wrapper = mount(ProfilePinField, {
    attachTo: document.body,
    props: { label: "Profile PIN", required },
  });
  return wrapper.findAll<HTMLInputElement>("input");
}
describe("ProfilePinField", () => {
  it("keeps leading zeros and advances focus as digits are entered", async () => {
    const boxes = mountField();
    expect(boxes).toHaveLength(4);
    for (const [index, digit] of [..."0123"].entries()) {
      await boxes[index]!.setValue(digit);
      expect(document.activeElement).toBe(boxes[Math.min(index + 1, 3)]!.element);
    }
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["0123"]);
    expect(boxes.every((box) => box.attributes("type") === "password")).toBe(true);
  });

  it("pastes a full PIN from any box and supports keyboard corrections", async () => {
    const boxes = mountField();
    await boxes[2]!.trigger("paste", { clipboardData: { getData: () => "0123" } });
    expect(boxes.map((box) => box.element.value)).toEqual(["0", "1", "2", "3"]);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["0123"]);
    await boxes[3]!.trigger("keydown", { key: "ArrowLeft" });
    expect(document.activeElement).toBe(boxes[2]!.element);
    await boxes[2]!.trigger("keydown", { key: "ArrowRight" });
    expect(document.activeElement).toBe(boxes[3]!.element);
    await boxes[3]!.setValue("");
    await boxes[3]!.trigger("keydown", { key: "Backspace" });
    expect(document.activeElement).toBe(boxes[2]!.element);
    expect(boxes[2]!.element.value).toBe("");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["01"]);
  });

  it("rejects non-digits and requires all boxes once an optional PIN is started", async () => {
    const boxes = mountField(false);
    expect(boxes.every((box) => box.attributes("required") === undefined)).toBe(true);
    await boxes[0]!.setValue("a");
    expect(boxes[0]!.element.value).toBe("");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    await boxes[0]!.setValue("0");
    expect(boxes.every((box) => box.attributes("required") !== undefined)).toBe(true);
    await boxes[1]!.trigger("paste", { clipboardData: { getData: () => "12a4" } });
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["0"]);
    await wrapper.setProps({ modelValue: "1234" });
    await wrapper.setProps({ modelValue: "" });
    expect(boxes.every((box) => box.element.value === "")).toBe(true);
  });
});
