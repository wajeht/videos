// @vitest-environment happy-dom

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import PlayerVideoStage from "./PlayerVideoStage.vue";

describe("PlayerVideoStage", () => {
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
