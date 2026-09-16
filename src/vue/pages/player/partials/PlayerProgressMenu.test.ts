// @vitest-environment happy-dom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import PlayerProgressMenu from "./PlayerProgressMenu.vue";

describe("PlayerProgressMenu", () => {
  it("keeps reset progress in an overflow menu", async () => {
    const wrapper = mount(PlayerProgressMenu, {
      props: { label: "Video actions", resetLabel: "Reset progress", resetting: false },
    });
    const trigger = wrapper.get('[aria-label="Video actions"]');

    expect(trigger.findAll(".player-progress-menu-dot")).toHaveLength(3);
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);

    await trigger.trigger("click");

    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get('[role="menuitem"]').text()).toBe("Reset progress");

    await wrapper.get('[role="menuitem"]').trigger("click");

    expect(wrapper.emitted("reset")).toHaveLength(1);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });

  it("regenerates the current video thumbnail from the overflow menu", async () => {
    const wrapper = mount(PlayerProgressMenu, {
      props: {
        label: "Video actions",
        resetLabel: "Reset progress",
        regenerateLabel: "Regenerate thumbnails",
        resetting: false,
        regenerating: false,
      },
    });

    await wrapper.get('[aria-label="Video actions"]').trigger("click");
    const items = wrapper.findAll('[role="menuitem"]');
    expect(items[0]?.text()).toBe("Regenerate thumbnails");
    await items[0]?.trigger("click");

    expect(wrapper.emitted("regenerate")).toHaveLength(1);
  });

  it("shows and toggles an enabled autoplay action", async () => {
    const wrapper = mount(PlayerProgressMenu, {
      props: {
        autoplayEnabled: true,
        autoplayLabel: "Autoplay next video",
        label: "Playlist actions",
        resetLabel: "Reset playlist progress",
        resetting: false,
      },
    });

    expect(wrapper.find(".player-progress-menu-autoplay-indicator").exists()).toBe(true);
    await wrapper.get('[aria-label="Playlist actions"]').trigger("click");
    const autoplay = wrapper.get('[role="menuitemcheckbox"]');
    expect(autoplay.attributes("aria-checked")).toBe("true");
    expect(autoplay.text()).toContain("On");

    await autoplay.trigger("click");

    expect(wrapper.emitted("autoplayChange")).toEqual([[false]]);
  });
});
