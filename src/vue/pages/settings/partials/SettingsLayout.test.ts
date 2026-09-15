// @vitest-environment happy-dom

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { shallowRef } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";

import { authKey } from "@/composables/useAuth.js";
import { confirmationKey } from "@/composables/useConfirm.js";

import SettingsLayout from "./SettingsLayout.vue";

async function mountSettingsLayout() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/settings/profiles", name: "settings-profiles", component: { template: "<div />" } },
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
  const request = vi.fn(async () => false);
  const queryClient = new QueryClient();
  const wrapper = mount(SettingsLayout, {
    slots: { default: '<section data-settings-page="" />' },
    global: {
      plugins: [router, [VueQueryPlugin, { queryClient }]],
      provide: {
        [authKey]: { logout: vi.fn() },
        [confirmationKey]: {
          accept: vi.fn(),
          active: shallowRef(null),
          cancel: vi.fn(),
          cancelOwner: vi.fn(),
          clear: vi.fn(),
          request,
        },
      },
    },
  });
  return { request, wrapper };
}

describe("SettingsLayout", () => {
  it("owns the shared settings page structure", async () => {
    const { request, wrapper } = await mountSettingsLayout();

    const pageHeader = wrapper.get("main > header");
    expect(pageHeader.get("h1").text()).toBe("Settings");
    expect(pageHeader.text()).toContain("Videos settings");
    expect(wrapper.get("[data-settings-layout]").classes()).toEqual(
      expect.arrayContaining(["grid-cols-[240px_minmax(0,1fr)]", "max-[760px]:grid-cols-1"]),
    );
    expect(wrapper.get('[aria-label="Settings sections"]').text()).toContain(
      "LibraryProfilesAccess",
    );
    expect(wrapper.get("[data-settings-page]").element.tagName).toBe("SECTION");
    expect(wrapper.get("[data-mobile-sign-out]").text()).toBe("Sign out");
    expect(wrapper.get("[data-desktop-sign-out]").text()).toBe("Sign out");
    expect(wrapper.get("footer").text()).toContain("© 2026 · Made with ❤️ by @wajeht . v0.1.0");

    await wrapper.get("[data-desktop-sign-out]").trigger("click");
    expect(request).toHaveBeenCalledOnce();
  });
});
