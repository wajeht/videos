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
    const boxes = wrapper.findAll('input[type="password"]');
    expect(boxes).toHaveLength(4);
    for (const [index, digit] of [..."0123"].entries()) await boxes[index]!.setValue(digit);
    await wrapper.get("form").trigger("submit");
    expect(selectProfile).toHaveBeenLastCalledWith("locked", "0123");
    wrapper.unmount();
    queryClient.clear();
  });
});
