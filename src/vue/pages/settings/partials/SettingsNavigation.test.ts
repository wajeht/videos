// @vitest-environment happy-dom

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import { authKey } from "@/composables/useAuth.js";

import SettingsNavigation from "./SettingsNavigation.vue";

describe("SettingsNavigation", () => {
  it("links to each settings route and marks the active section", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/settings/profiles",
          name: "settings-profiles",
          component: { template: "<div />" },
        },
        {
          path: "/settings/library",
          name: "settings-library",
          component: { template: "<div />" },
        },
        {
          path: "/settings/access",
          name: "settings-access",
          component: { template: "<div />" },
        },
      ],
    });
    await router.push("/settings/library");
    const queryClient = new QueryClient();
    const state = reactive({ profile: { role: "admin" } });
    const wrapper = mount(SettingsNavigation, {
      global: {
        plugins: [router, [VueQueryPlugin, { queryClient }]],
        provide: { [authKey]: { state } },
      },
    });
    const sectionLinks = wrapper.findAll("a");

    expect(sectionLinks.map((link) => link.text())).toEqual(["Library", "Profiles", "Access"]);
    expect(sectionLinks.map((link) => link.attributes("href"))).toEqual([
      "/settings/library",
      "/settings/profiles",
      "/settings/access",
    ]);
    expect(sectionLinks[0]?.attributes("aria-current")).toBe("page");
    expect(sectionLinks[2]?.attributes("aria-current")).toBeUndefined();
    expect(sectionLinks[0]?.classes()).toContain("bg-pine!");
    expect(sectionLinks[0]?.classes()).toContain("h-10");
    expect(sectionLinks[0]?.classes()).not.toContain("min-h-12");
    expect(sectionLinks[0]?.classes().some((className) => className.includes("shadow"))).toBe(
      false,
    );

    await router.push("/settings/access");
    await flushPromises();
    expect(sectionLinks[0]?.attributes("aria-current")).toBeUndefined();
    expect(sectionLinks[2]?.attributes("aria-current")).toBe("page");
    expect(sectionLinks[2]?.classes()).toContain("bg-pine!");

    state.profile.role = "member";
    await flushPromises();
    expect(wrapper.findAll("a").map((link) => link.text())).toEqual(["Library", "Profiles"]);
  });
});
