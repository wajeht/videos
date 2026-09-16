// @vitest-environment happy-dom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import AppInput from "./AppInput.vue";

describe("AppInput", () => {
  it("updates its model and toggles password visibility", async () => {
    const wrapper = mount(AppInput, { props: { modelValue: "secret", type: "password" } });
    const input = wrapper.get("input");
    const toggle = wrapper.get("button");

    expect(input.attributes("type")).toBe("password");
    expect(toggle.attributes("aria-label")).toBe("Show password");
    expect(toggle.find('[data-icon="eye"]').exists()).toBe(true);
    await toggle.trigger("click");
    expect(input.attributes("type")).toBe("text");
    expect(toggle.attributes("aria-label")).toBe("Hide password");
    expect(toggle.find('[data-icon="eye-off"]').exists()).toBe(true);
    await input.setValue("new secret");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["new secret"]);
    await input.setValue("");
    expect(wrapper.find("button").exists()).toBe(false);
    expect(input.attributes("type")).toBe("password");
  });

  it("hides the password toggle when the input is empty", async () => {
    const wrapper = mount(AppInput, { props: { type: "password" } });

    expect(wrapper.find("button").exists()).toBe(false);
    await wrapper.get("input").setValue("secret");
    expect(wrapper.get("button").attributes("aria-label")).toBe("Show password");
  });

  it("announces invalid inputs to assistive technology", () => {
    const wrapper = mount(AppInput, { props: { invalid: true } });
    const input = wrapper.get("input");

    expect(input.attributes("aria-invalid")).toBe("true");
  });
});
