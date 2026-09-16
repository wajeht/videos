// @vitest-environment happy-dom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import AppFooter from "./AppFooter.vue";

describe("AppFooter", () => {
  it("links to the project repository and shows the current app version", () => {
    const wrapper = mount(AppFooter);
    const githubLink = wrapper.get('a[href="https://github.com/wajeht"]');

    expect(githubLink.text()).toBe("@wajeht");
    expect(githubLink.attributes("aria-label")).toBe("App author on GitHub (opens in a new tab)");
    expect(githubLink.attributes("rel")).toBe("noreferrer");
    expect(wrapper.text()).toContain("© 2026 · Made with ❤️ by @wajeht . v0.1.0");
  });
});
