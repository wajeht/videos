// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { ApiError } from "@/api.js";
import { authKey } from "@/composables/useAuth.js";
import { toastKey } from "@/composables/useToast.js";

import AccessPage from "./AccessPage.vue";

function mountAccessPage(
  changePassword = vi.fn(),
  state = reactive<{ profile: { role: "admin" | "member" } | null }>({
    profile: { role: "admin" },
  }),
) {
  return mount(AccessPage, {
    global: {
      provide: {
        [authKey]: { changePassword, state },
        [toastKey]: { success: vi.fn() },
      },
      stubs: {
        SettingsLayout: { template: "<slot />" },
        IntentRouterLink: { template: "<a><slot /></a>" },
      },
    },
  });
}

describe("settings/AccessPage", () => {
  it.each([null, { role: "member" as const }])(
    "hides the page without an admin profile: %j",
    (profile) => {
      const wrapper = mountAccessPage(vi.fn(), reactive({ profile }));

      expect(wrapper.get("h1").text()).toBe("Page not found");
      expect(wrapper.find("#settings-access-panel").exists()).toBe(false);
      expect(wrapper.find("form").exists()).toBe(false);
    },
  );

  it("hides the page when the selected profile loses admin access", async () => {
    const state = reactive<{ profile: { role: "admin" | "member" } }>({
      profile: { role: "admin" },
    });
    const wrapper = mountAccessPage(vi.fn(), state);
    expect(wrapper.find("form").exists()).toBe(true);

    state.profile.role = "member";
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Page not found");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("renders only the access settings", () => {
    const wrapper = mountAccessPage();

    expect(wrapper.get("header h2").text()).toBe("Access");
    expect(wrapper.text()).toContain("Use at least 15 characters.");
    expect(wrapper.get("[data-change-password]").classes()).toContain("mt-4");
    expect(wrapper.find("[data-library-status]").exists()).toBe(false);
  });

  it("validates matching passwords before changing them", async () => {
    const wrapper = mountAccessPage();
    const inputs = wrapper.findAll('input[type="password"]');

    await inputs[0]?.setValue("current-password");
    await inputs[1]?.setValue("a-new-password-long-enough");
    await inputs[2]?.setValue("a-different-password");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.text()).toContain("Passwords do not match");
  });

  it("shows general password errors at the top of the form", async () => {
    const changePassword = vi
      .fn()
      .mockRejectedValue(new ApiError("Password must be at least 15 characters", 400));
    const wrapper = mountAccessPage(changePassword);
    const inputs = wrapper.findAll('input[type="password"]');

    await inputs[0]?.setValue("current-password");
    await inputs[1]?.setValue("a-new-password-long-enough");
    await inputs[2]?.setValue("a-new-password-long-enough");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toBe("Password must be at least 15 characters");
    expect(wrapper.get("form").element.firstElementChild).toBe(alert.element);
  });

  it("shows an incorrect current password beneath its field", async () => {
    const changePassword = vi
      .fn()
      .mockRejectedValue(new ApiError("Current password is incorrect", 400));
    const wrapper = mountAccessPage(changePassword);
    const inputs = wrapper.findAll('input[type="password"]');

    await inputs[0]?.setValue("wrong-current-password");
    await inputs[1]?.setValue("a-new-password-long-enough");
    await inputs[2]?.setValue("a-new-password-long-enough");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    const currentPassword = inputs[0];
    const error = wrapper.get('[role="alert"]');
    expect(currentPassword?.attributes("aria-invalid")).toBe("true");
    expect(currentPassword?.classes()).toContain("border-clay");
    expect(currentPassword?.attributes("aria-describedby")).toContain(error.attributes("id"));
    expect(error.text()).toBe("Current password is incorrect");
  });
});
