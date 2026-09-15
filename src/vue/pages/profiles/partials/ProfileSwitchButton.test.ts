// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authKey } from "@/composables/useAuth.js";
import { toastKey } from "@/composables/useToast.js";
import ProfileSwitchButton from "./ProfileSwitchButton.vue";

let wrapper: VueWrapper;
afterEach(() => wrapper.unmount());
function mountSwitcher() {
  const clearProfile = vi.fn(async () => {});
  const error = vi.fn();
  wrapper = mount(ProfileSwitchButton, {
    attachTo: document.body,
    global: {
      provide: {
        [authKey]: { state: { profile: { name: "Jaw" } }, clearProfile },
        [toastKey]: { error },
      },
    },
  });
  return { clearProfile, error };
}

describe("profile menu", () => {
  it("opens the menu before switching profiles", async () => {
    const { clearProfile } = mountSwitcher();
    const trigger = wrapper.get('button[aria-label="Profile menu"]');
    expect(trigger.text()).toBe("Jaw");
    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(clearProfile).not.toHaveBeenCalled();
    await wrapper.get('[role="menuitem"]').trigger("click");
    await flushPromises();
    expect(clearProfile).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });

  it("supports keyboard opening, Escape, and outside dismissal", async () => {
    mountSwitcher();
    const trigger = wrapper.get('button[aria-label="Profile menu"]');
    await trigger.trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(wrapper.get('[role="menuitem"]').element);
    await wrapper.get('[role="menuitem"]').trigger("keydown", { key: "Escape" });
    expect(document.activeElement).toBe(trigger.element);
    expect(trigger.attributes("aria-expanded")).toBe("false");
    await trigger.trigger("click");
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });

  it("reports a failed switch without leaving the menu open", async () => {
    const { clearProfile, error } = mountSwitcher();
    clearProfile.mockRejectedValueOnce(new Error("Offline"));
    await wrapper.get('button[aria-label="Profile menu"]').trigger("click");
    await wrapper.get('[role="menuitem"]').trigger("click");
    await flushPromises();
    expect(error).toHaveBeenCalledWith("Could not switch profiles");
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });
});
