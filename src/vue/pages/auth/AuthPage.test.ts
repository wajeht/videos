// @vitest-environment happy-dom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import AuthPage from "./AuthPage.vue";

const baseProps = {
  busy: false,
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

    expect(inputs).toHaveLength(11);
    expect(inputs.every((input) => input.classes().includes("min-h-10"))).toBe(true);
    expect(inputs.every((input) => !input.classes().includes("lg:min-h-12"))).toBe(true);
    expect(submit.classes()).toContain("h-10");
    expect(submit.classes()).not.toContain("lg:h-12");
  });
  it("submits the shared password and first admin profile together", async () => {
    const wrapper = mount(AuthPage, { props: { ...baseProps, passwordConfigured: false } });
    const passwords = wrapper.findAll('input[type="password"]');
    await passwords[0]!.setValue("shared-library-password");
    await passwords[1]!.setValue("shared-library-password");
    await wrapper.get('input[maxlength="40"]').setValue("Owner");
    for (const pinInput of passwords.slice(2)) {
      expect(pinInput.attributes("inputmode")).toBe("numeric");
      expect(pinInput.attributes("pattern")).toBe("\\d");
      expect(pinInput.attributes("maxlength")).toBe("1");
    }
    for (const [index, digit] of [..."01239876"].entries())
      await passwords[index + 2]!.setValue(digit);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("setup")).toBeUndefined();
    expect(wrapper.text()).toContain("PINs do not match");
    for (const [index, digit] of [..."0123"].entries()) await passwords[index + 6]!.setValue(digit);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("setup")).toEqual([
      ["shared-library-password", "shared-library-password", "Owner", "0123", undefined],
    ]);
  });
});
