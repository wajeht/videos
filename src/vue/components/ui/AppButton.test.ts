// @vitest-environment happy-dom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import AppButton from "./AppButton.vue";

describe("AppButton", () => {
  it("defaults to a safe button and emits clicks", async () => {
    const wrapper = mount(AppButton, { slots: { default: "Save" } });

    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.attributes("type")).toBe("button");
    await wrapper.trigger("click");
    expect(wrapper.emitted("click")).toHaveLength(1);
  });

  it("blocks interactions and announces progress while loading", async () => {
    const wrapper = mount(AppButton, {
      props: { loading: true, loadingLabel: "Saving…" },
      slots: { default: "Save" },
    });

    expect(wrapper.attributes("disabled")).toBeDefined();
    expect(wrapper.attributes("aria-busy")).toBe("true");
    expect(wrapper.text()).toContain("Saving…");
    await wrapper.trigger("click");
    expect(wrapper.emitted("click")).toBeUndefined();
  });

  it("renders link-like targets without a disabled attribute", () => {
    const wrapper = mount(AppButton, {
      attrs: { href: "/settings" },
      props: { as: "a", disabled: true },
      slots: { default: "Settings" },
    });

    expect(wrapper.element.tagName).toBe("A");
    expect(wrapper.attributes("href")).toBe("/settings");
    expect(wrapper.attributes("disabled")).toBeUndefined();
    expect(wrapper.attributes("aria-disabled")).toBe("true");
  });
});
