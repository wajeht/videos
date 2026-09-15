// @vitest-environment happy-dom

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { shallowRef } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";

import { authKey } from "@/composables/useAuth.js";
import { confirmationKey } from "@/composables/useConfirm.js";

import SettingsLayout from "./SettingsLayout.vue";

async function mountSettingsLayout(role = "admin") {
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
  const clearProfile = vi.fn(async () => {});
  const request = vi.fn(async () => false);
  const queryClient = new QueryClient();
  const wrapper = mount(SettingsLayout, {
    slots: { default: '<section data-settings-page="" />' },
    global: {
      plugins: [router, [VueQueryPlugin, { queryClient }]],
      provide: {
        [authKey]: { logout: vi.fn(), clearProfile, state: { profile: { role } } },
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
  return { request, wrapper, clearProfile, router };
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
  it.each(["admin", "member"])("lets a %s switch profiles from settings", async (role) => {
    const { wrapper, clearProfile, router } = await mountSettingsLayout(role);
    const button = wrapper.findAll("button").find((button) => button.text() === "Switch profile")!;
    await button.trigger("click");
    await flushPromises();
    expect(clearProfile).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.name).toBe("settings-profiles");
    wrapper.unmount();
  });

  it("shows a switch failure and allows retrying", async () => {
    const { wrapper, clearProfile, router } = await mountSettingsLayout();
    clearProfile.mockRejectedValueOnce(new Error("Offline"));
    const button = wrapper.findAll("button").find((button) => button.text() === "Switch profile")!;
    await button.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Could not switch profiles");
    expect(button.attributes("disabled")).toBeUndefined();
    expect(router.currentRoute.value.name).toBe("settings-library");
    await button.trigger("click");
    await flushPromises();
    expect(clearProfile).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
