// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/api.js";
import { authKey } from "@/composables/useAuth.js";
import ProfilesPage from "./ProfilesPage.vue";

describe("profile picker", () => {
  it("opens an unlocked profile and asks for a PIN on a locked profile", async () => {
    vi.spyOn(api, "listProfiles").mockResolvedValue([
      { id: "open", name: "Open", avatarKey: "sage", role: "member", isLocked: false },
      { id: "locked", name: "Private", avatarKey: "pine", role: "admin", isLocked: true },
    ]);
    const selectProfile = vi.fn(async () => {});
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = mount(ProfilesPage, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
        provide: { [authKey]: { selectProfile, logout: vi.fn() } },
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
    const boxes = wrapper.findAll('input[type="password"]');
    expect(boxes).toHaveLength(4);
    for (const [index, digit] of [..."0123"].entries()) await boxes[index]!.setValue(digit);
    await wrapper.get("form").trigger("submit");
    expect(selectProfile).toHaveBeenLastCalledWith("locked", "0123");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Back to profiles")!
      .trigger("click");
    expect(wrapper.get("h1").text()).toBe("Who’s watching?");
    expect(wrapper.text()).toContain("Sign out");
    wrapper.unmount();
    queryClient.clear();
  });
});
