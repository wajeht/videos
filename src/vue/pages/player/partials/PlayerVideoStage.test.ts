// @vitest-environment happy-dom

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import PlayerVideoStage from "./PlayerVideoStage.vue";

describe("PlayerVideoStage", () => {
  it("shows waiting in queue until conversion starts, then shows progress", async () => {
    const queryClient = new QueryClient();
    const wrapper = mount(PlayerVideoStage, {
      props: {
        ended: false,
        error: "",
        loading: false,
        playback: { kind: "converting", status: "queued", progress: 0 },
        retrying: false,
      },
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });

    expect(wrapper.get('[role="status"]').text()).toContain("Waiting in queue");
    expect(wrapper.text()).toContain("Yours will start automatically.");
    expect(wrapper.text()).not.toContain("0% complete.");

    await wrapper.setProps({
      playback: { kind: "converting", status: "converting", progress: 0 },
    });
    expect(wrapper.get('[role="status"]').text()).toContain("Preparing this video");
    expect(wrapper.text()).toContain("0% complete.");
    expect(wrapper.text()).not.toContain("Waiting in queue");

    await wrapper.setProps({
      playback: { kind: "converting", status: "converting", progress: 24 },
    });
    expect(wrapper.text()).toContain("24% complete.");
    wrapper.unmount();
  });

  it("shows polling errors above conversion progress and offers retry", async () => {
    const queryClient = new QueryClient();
    const wrapper = mount(PlayerVideoStage, {
      props: {
        ended: false,
        error: "We couldn't check the video status. Try again.",
        loading: false,
        playback: { kind: "converting", status: "queued", progress: 0 },
        retrying: false,
      },
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    expect(wrapper.text()).toContain("We couldn't check the video status");
    expect(wrapper.text()).not.toContain("Preparing this video");
    expect(wrapper.text()).not.toContain("Waiting in queue");
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
    wrapper.unmount();
  });

  it("uses the selected image as the native video poster", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = mount(PlayerVideoStage, {
      props: {
        ended: false,
        error: "",
        loading: false,
        playback: { kind: "direct", url: "/media/video" },
        poster: "/covers/chapter.jpg",
        retrying: false,
      },
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });

    expect(wrapper.get("video").attributes("poster")).toBe("/covers/chapter.jpg");
  });
});
