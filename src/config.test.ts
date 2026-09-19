import path from "node:path";

import { describe, expect, it } from "vitest";

import { createConfiguration } from "./config.js";

describe("createConfiguration", () => {
  it("uses opinionated local defaults", () => {
    const configuration = createConfiguration({ APP_ENV: "development" });

    expect(configuration.media.dataDirectory).toBe(path.resolve("data"));
    expect(configuration.media.videosDirectory).toBe("/Volumes/plex/videos");
    expect(configuration.app.port).toBe(80);
    expect(configuration.app.vuePort).toBe(3000);
    expect(configuration.auth.trustedProxies).toEqual([]);
  });

  it("uses the same defaults for a direct production start", () => {
    const configuration = createConfiguration({
      APP_ENV: "production",
      SESSION_SECRET: "production-session-secret-1234567890",
    });

    expect(configuration.media.dataDirectory).toBe(path.resolve("data"));
    expect(configuration.media.videosDirectory).toBe("/Volumes/plex/videos");
  });

  it("honors explicit container paths", () => {
    const configuration = createConfiguration({
      APP_ENV: "production",
      APP_PORT: "3000",
      APP_VUE_PORT: "5173",
      DATA_DIR: "/data",
      VIDEOS_DIR: "/videos",
      SESSION_SECRET: "production-session-secret-1234567890",
    });

    expect(configuration.media.dataDirectory).toBe("/data");
    expect(configuration.media.videosDirectory).toBe("/videos");
    expect(configuration.app.port).toBe(3000);
    expect(configuration.app.vuePort).toBe(5173);
  });

  it("requires an explicit session secret in production", () => {
    expect(() => createConfiguration({ APP_ENV: "production" })).toThrow(
      "SESSION_SECRET must be set in production",
    );
  });

  it("accepts explicit proxy addresses and networks", () => {
    const configuration = createConfiguration({
      TRUSTED_PROXIES: "192.0.2.1, 198.51.100.0/24, 2001:db8::1, 2001:db8:1::/48",
    });
    expect(configuration.auth.trustedProxies).toEqual([
      "192.0.2.1",
      "198.51.100.0/24",
      "2001:db8::1",
      "2001:db8:1::/48",
    ]);
  });

  it.each(["true", "*", "example.com", "192.0.2.1/33", "2001:db8::/129", "192.0.2.1,"])(
    "rejects invalid trusted proxy configuration: %s",
    (trustedProxies) => {
      expect(() => createConfiguration({ TRUSTED_PROXIES: trustedProxies })).toThrow();
    },
  );

  it.each(["/videos", "/videos/data"])(
    "rejects a data directory inside the video library: %s",
    (dataDirectory) => {
      expect(() =>
        createConfiguration({
          APP_ENV: "development",
          DATA_DIR: dataDirectory,
          VIDEOS_DIR: "/videos",
        }),
      ).toThrow("DATA_DIR must be outside VIDEOS_DIR");
    },
  );
});
