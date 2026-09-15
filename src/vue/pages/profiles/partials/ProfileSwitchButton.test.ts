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

describe("profile switcher", () => {
  it("switches profiles directly when the profile name is clicked", async () => {
    const { clearProfile } = mountSwitcher();
    const trigger = wrapper.get('button[aria-label="Switch profile"]');
    expect(trigger.text()).toBe("Jaw");
    await trigger.trigger("click");
    await flushPromises();
    expect(clearProfile).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });

  it("reports a failed switch", async () => {
    const { clearProfile, error } = mountSwitcher();
    clearProfile.mockRejectedValueOnce(new Error("Offline"));
    await wrapper.get('button[aria-label="Switch profile"]').trigger("click");
    await flushPromises();
    expect(error).toHaveBeenCalledWith("Could not switch profiles");
    expect(wrapper.get("button").attributes("disabled")).toBeUndefined();
  });
});
