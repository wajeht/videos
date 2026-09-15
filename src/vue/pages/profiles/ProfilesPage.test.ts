// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/api.js";
import { authKey } from "@/composables/useAuth.js";
import ProfilesPage from "./ProfilesPage.vue";

describe("profile picker", () => {
  it("opens an unlocked profile and asks for a password on a locked profile", async () => {
    vi.spyOn(api, "listProfiles").mockResolvedValue([
      { id: "open", name: "Open", role: "member", isLocked: false },
      { id: "locked", name: "Private", role: "admin", isLocked: true },
    ]);
    const selectProfile = vi.fn(async () => {});
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = mount(ProfilesPage, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
        provide: { [authKey]: { selectProfile } },
      },
    });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Open"))!
      .trigger("click");
    expect(selectProfile).toHaveBeenCalledWith("open", "");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Private"))!
      .trigger("click");
    expect(selectProfile).toHaveBeenCalledTimes(1);
    expect(wrapper.get("h1").text()).toBe("Unlock Private");
    expect(wrapper.text()).not.toContain("Sign out");
    expect(wrapper.text()).not.toContain("Who’s watching?");
    expect(wrapper.text()).not.toContain("Your progress. Your place in the library.");
    await wrapper.get('input[type="password"]').setValue("private-password");
    await wrapper.get("form").trigger("submit");
    expect(selectProfile).toHaveBeenLastCalledWith("locked", "private-password");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Back to profiles")!
      .trigger("click");
    expect(wrapper.get("h1").text()).toBe("Who’s watching?");
    expect(wrapper.text()).not.toContain("Sign out");
    wrapper.unmount();
    queryClient.clear();
  });
  it("asks for a password when an open profile was locked after the list loaded", async () => {
    vi.spyOn(api, "listProfiles").mockResolvedValue([
      { id: "member", name: "😀 Member", role: "member", isLocked: false },
    ]);
    const selectProfile = vi
      .fn(async () => {})
      .mockRejectedValueOnce(new ApiError("Incorrect profile password", 403));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = mount(ProfilesPage, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
        provide: { [authKey]: { selectProfile } },
      },
    });
    await flushPromises();
    expect(wrapper.get('[aria-hidden="true"]').text()).toBe("😀");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Member"))!
      .trigger("click");
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("Unlock 😀 Member");
    expect(wrapper.text()).not.toContain("Incorrect profile password");
    await wrapper.get('input[type="password"]').setValue("member-password");
    await wrapper.get("form").trigger("submit");
    expect(selectProfile).toHaveBeenLastCalledWith("member", "member-password");
    wrapper.unmount();
    queryClient.clear();
  });
});
