// @vitest-environment happy-dom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import FormSection from "./FormSection.vue";

describe("FormSection", () => {
  it("renders a consistent title and description", () => {
    const wrapper = mount(FormSection, {
      props: { description: "Card details", title: "Card title" },
    });

    expect(wrapper.get("h2").text()).toBe("Card title");
    expect(wrapper.get("p").text()).toBe("Card details");
  });

  it("renders content inside the fieldset without an optional description", () => {
    const wrapper = mount(FormSection, {
      props: { title: "Profile" },
      slots: { default: "Form content" },
    });

    expect(wrapper.element.tagName).toBe("FIELDSET");
    expect(wrapper.get("legend").text()).toBe("Profile");
    expect(wrapper.text()).toContain("Form content");
    expect(wrapper.find("p").exists()).toBe(false);
  });
});
