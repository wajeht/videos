// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { api, ApiError } from "@/api.js";
import { authKey } from "@/composables/useAuth.js";
import ProfilesPage from "./ProfilesPage.vue";

async function createProfileRouter(url = "/settings/profiles") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: ProfilesPage }],
  });
  await router.push(url);
  await router.isReady();
  return router;
}

describe("profile picker", () => {
  it("opens an unlocked profile and asks for a password on a locked profile", async () => {
    vi.spyOn(api, "listProfiles").mockResolvedValue([
      { id: "open", name: "Open", role: "member", isLocked: false },
      { id: "locked", name: "Private", role: "admin", isLocked: true },
    ]);
    const selectProfile = vi.fn(async () => {});
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = await createProfileRouter();
    const wrapper = mount(ProfilesPage, {
      global: {
        plugins: [router, [VueQueryPlugin, { queryClient }]],
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
    await flushPromises();
    expect(router.currentRoute.value.query.unlockProfile).toBe("locked");
    expect(selectProfile).toHaveBeenCalledTimes(1);
    expect(wrapper.get("h1").text()).toBe("Unlock Private");
    expect(wrapper.findAll("h1, h2").map((heading) => heading.text())).toEqual([
      "Unlock Private",
      "Details",
    ]);
    expect(wrapper.get("form > fieldset > legend").text()).toBe("Details");
    expect(wrapper.text()).not.toContain("Sign out");
    expect(wrapper.text()).not.toContain("Who’s watching?");
    expect(wrapper.text()).not.toContain("Your progress. Your place in the library.");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Back to profiles")!
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.unlockProfile).toBeUndefined();
    expect(wrapper.get("h1").text()).toBe("Who’s watching?");
    expect(wrapper.text()).not.toContain("Sign out");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Private"))!
      .trigger("click");
    await flushPromises();
    await wrapper.get('input[type="password"]').setValue("private-password");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(selectProfile).toHaveBeenLastCalledWith("locked", "private-password");
    expect(router.currentRoute.value.fullPath).toBe("/settings/profiles");
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
    const router = await createProfileRouter();
    const wrapper = mount(ProfilesPage, {
      global: {
        plugins: [router, [VueQueryPlugin, { queryClient }]],
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
  it("restores the unlock screen from the URL without a password and preserves the destination on cancel", async () => {
    vi.spyOn(api, "listProfiles").mockResolvedValue([
      { id: "locked", name: "Private", role: "admin", isLocked: true },
    ]);
    const selectProfile = vi.fn(async () => {});
    const initialUrl = "/settings/profiles?filter=all&unlockProfile=locked#details";
    const router = await createProfileRouter(initialUrl);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = mount(ProfilesPage, {
      global: {
        plugins: [router, [VueQueryPlugin, { queryClient }]],
        provide: { [authKey]: { selectProfile } },
      },
    });
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("Unlock Private");
    expect(wrapper.get<HTMLInputElement>('input[type="password"]').element.value).toBe("");
    expect(selectProfile).not.toHaveBeenCalled();
    await wrapper.get('input[type="password"]').setValue("unsent-password");
    expect(router.currentRoute.value.fullPath).toBe(initialUrl);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Back to profiles")!
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/settings/profiles?filter=all#details");
    wrapper.unmount();
    queryClient.clear();
  });

  it("shows the profile picker when the URL refers to a deleted profile", async () => {
    vi.spyOn(api, "listProfiles").mockResolvedValue([]);
    const router = await createProfileRouter("/settings/profiles?unlockProfile=deleted");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const selectProfile = vi.fn(async () => {});
    const wrapper = mount(ProfilesPage, {
      global: {
        plugins: [router, [VueQueryPlugin, { queryClient }]],
        provide: { [authKey]: { selectProfile } },
      },
    });
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("Who’s watching?");
    expect(selectProfile).not.toHaveBeenCalled();
    wrapper.unmount();
    queryClient.clear();
  });
});
