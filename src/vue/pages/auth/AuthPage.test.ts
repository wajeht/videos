// @vitest-environment happy-dom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import AuthPage from "./AuthPage.vue";

const baseProps = {
  busy: false,
  adminProfileRequired: false,
  message: undefined,
  passwordError: undefined,
  setupEnabled: true,
  setupTokenRequired: false,
  status: "unauthenticated" as const,
};

describe("AuthPage", () => {
  it("does not show password setup guidance when signing in", () => {
    const wrapper = mount(AuthPage, {
      props: { ...baseProps, passwordConfigured: true },
    });
    const password = wrapper.get('input[autocomplete="current-password"]');

    expect(password.attributes("minlength")).toBeUndefined();
    expect(wrapper.text()).toContain("Please sign in to continue.");
    expect(wrapper.text()).not.toContain("Use at least 15 characters.");
  });

  it("shows sign-in errors beneath the invalid password field", () => {
    const wrapper = mount(AuthPage, {
      props: { ...baseProps, passwordConfigured: true, passwordError: "Invalid password" },
    });
    const password = wrapper.get('input[autocomplete="current-password"]');
    const error = wrapper.get('[role="alert"]');

    expect(password.attributes("aria-invalid")).toBe("true");
    expect(password.classes()).toContain("border-clay");
    expect(password.attributes("aria-describedby")).toContain(error.attributes("id"));
    expect(error.text()).toBe("Invalid password");
  });

  it("shows general sign-in errors beneath the introduction", () => {
    const wrapper = mount(AuthPage, {
      props: {
        ...baseProps,
        passwordConfigured: true,
        message: "Your session expired. Sign in again.",
      },
    });
    const introduction = wrapper.get("form > p");
    const password = wrapper.get('input[autocomplete="current-password"]');
    const alert = wrapper.get('[role="alert"]');

    expect(introduction.element.nextElementSibling).toBe(alert.element);
    expect(alert.text()).toBe("Your session expired. Sign in again.");
    expect(password.attributes("aria-invalid")).toBeUndefined();
    expect(password.attributes("aria-describedby")).toBeUndefined();
  });

  it("shows the project link and current app version", () => {
    const wrapper = mount(AuthPage, {
      props: { ...baseProps, passwordConfigured: true },
    });
    const githubLink = wrapper.get('a[href="https://github.com/wajeht"]');

    expect(githubLink.text()).toBe("@wajeht");
    expect(githubLink.attributes("rel")).toBe("noreferrer");
    expect(wrapper.text()).toContain("© 2026 · Made with ❤️ by @wajeht . v0.1.0");
  });

  it("requires 15 characters when creating a password", () => {
    const wrapper = mount(AuthPage, {
      props: { ...baseProps, passwordConfigured: false },
    });

    expect(wrapper.get('input[autocomplete="new-password"]').attributes("minlength")).toBe("15");
    expect(wrapper.text()).toContain("Use at least 15 characters.");
    expect(wrapper.text()).toContain("Set up your library");
  });

  it("shows general setup errors directly beneath the introduction", () => {
    const wrapper = mount(AuthPage, {
      props: {
        ...baseProps,
        passwordConfigured: false,
        message: "Password must be at least 15 characters",
      },
    });
    const introduction = wrapper.get("form > p");
    const alert = wrapper.get('[role="alert"]');

    expect(introduction.text()).toBe(
      "Create the password that protects your private video library.",
    );
    expect(introduction.element.nextElementSibling).toBe(alert.element);
    expect(alert.text()).toBe("Password must be at least 15 characters");
  });

  it("explains the setup token", () => {
    const wrapper = mount(AuthPage, {
      props: { ...baseProps, passwordConfigured: false, setupTokenRequired: true },
    });

    expect(wrapper.text()).toContain("Enter the one-time setup token configured on your server.");
  });

  it("uses the shared control height throughout the setup form", () => {
    const wrapper = mount(AuthPage, {
      props: { ...baseProps, passwordConfigured: false, setupTokenRequired: true },
    });
    const inputs = wrapper.findAll('input[type="password"]');
    const submit = wrapper.get('button[type="submit"]');

    expect(inputs).toHaveLength(3);
    expect(inputs.every((input) => input.classes().includes("min-h-10"))).toBe(true);
    expect(inputs.every((input) => !input.classes().includes("lg:min-h-12"))).toBe(true);
    expect(submit.classes()).toContain("h-10");
    expect(submit.classes()).not.toContain("lg:h-12");
  });
  it("saves the shared password before advancing to admin setup", async () => {
    const wrapper = mount(AuthPage, {
      props: { ...baseProps, passwordConfigured: false, setupTokenRequired: true },
    });
    await wrapper.get('input[autocomplete="one-time-code"]').setValue("setup-token");
    const passwords = wrapper.findAll('input[autocomplete="new-password"]');
    await passwords[0]!.setValue("shared-library-password");
    await passwords[1]!.setValue("a-different-password");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.text()).toContain("Passwords do not match");
    expect(wrapper.emitted("setup")).toBeUndefined();
    await passwords[1]!.setValue("shared-library-password");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("setup")).toEqual([
      ["shared-library-password", "shared-library-password", "setup-token"],
    ]);
    expect(wrapper.text()).toContain("Step 1 of 2");
    await wrapper.setProps({
      passwordConfigured: true,
      adminProfileRequired: true,
      status: "authenticated",
    });
    expect(wrapper.text()).toContain("Step 2 of 2");
    expect(wrapper.find('input[minlength="15"]').exists()).toBe(false);
    expect(wrapper.emitted("setupAdmin")).toBeUndefined();
  });

  it("resumes at admin setup without asking for the saved library password", async () => {
    const wrapper = mount(AuthPage, {
      props: {
        ...baseProps,
        passwordConfigured: true,
        adminProfileRequired: true,
        setupEnabled: false,
        status: "authenticated",
      },
    });
    expect(wrapper.text()).toContain("Step 2 of 2");
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(false);
    expect(wrapper.find('input[minlength="15"]').exists()).toBe(false);
    await wrapper.get('input[maxlength="40"]').setValue("Owner");
    const passwords = wrapper.findAll('input[type="password"]');
    await passwords[0]!.setValue("admin-profile-password");
    await passwords[1]!.setValue("different-password");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("setupAdmin")).toBeUndefined();
    expect(wrapper.text()).toContain("Passwords do not match");
    await passwords[1]!.setValue("admin-profile-password");
    await wrapper.setProps({ busy: true });
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("setupAdmin")).toBeUndefined();
    await wrapper.setProps({ busy: false, message: "Could not create the admin profile" });
    expect(wrapper.get<HTMLInputElement>('input[maxlength="40"]').element.value).toBe("Owner");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("setupAdmin")).toEqual([["Owner", "admin-profile-password"]]);
    expect(wrapper.emitted("setup")).toBeUndefined();
  });
});
