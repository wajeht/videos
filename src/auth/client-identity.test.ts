import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createConfiguration } from "../config.js";
import { createTestContext } from "../test/resources.js";
import { clientKey } from "./client-identity.js";

function peerBindings(address: string) {
  return { incoming: { socket: { remoteAddress: address } } };
}

async function identity(peer: string | undefined, headers = {}, trustedProxies = "") {
  const configuration = createConfiguration({ TRUSTED_PROXIES: trustedProxies });
  const app = new Hono().get("/", (c) => c.text(clientKey(c, configuration)));
  const response = await app.request("/", { headers }, peer ? peerBindings(peer) : undefined);
  return response.text();
}

describe("rate-limit client identity", () => {
  it("ignores forwarding headers from direct clients and keeps their buckets separate", async () => {
    const direct = await identity("192.0.2.1");
    expect(
      await identity("192.0.2.1", {
        "x-forwarded-for": "198.51.100.1",
        "cf-connecting-ip": "203.0.113.1",
      }),
    ).toBe(direct);
    expect(await identity("192.0.2.2")).not.toBe(direct);
  });

  it("stops at the first untrusted hop instead of using a supplied leftmost address", async () => {
    const headers = { "x-forwarded-for": "203.0.113.99, 198.51.100.7, 192.0.2.2" };
    expect(await identity("192.0.2.1", headers, "192.0.2.0/24")).toBe(
      await identity("198.51.100.7"),
    );
    expect(await identity("198.51.100.8", headers, "192.0.2.0/24")).toBe(
      await identity("198.51.100.8"),
    );
  });

  it.each(["invalid", "", "2001:db8::1%eth0"])(
    "ignores a malformed prefix beyond the first untrusted hop: %s",
    async (prefix) => {
      expect(
        await identity(
          "192.0.2.1",
          { "x-forwarded-for": `${prefix}, 198.51.100.7` },
          "192.0.2.0/24",
        ),
      ).toBe(await identity("198.51.100.7"));
    },
  );

  it("uses canonical addresses for trusted IPv6 chains", async () => {
    expect(
      await identity(
        "2001:db8:1::1",
        { "x-forwarded-for": "2001:0db8:0:0:0:0:0:7, 2001:db8:1::2" },
        "2001:db8:1::/48",
      ),
    ).toBe(await identity("2001:db8::7"));
    // oxlint-disable-next-line sonarjs/no-hardcoded-ip -- IPv4-mapped documentation address.
    expect(await identity("::ffff:c000:201")).toBe(await identity("192.0.2.1"));
    expect(
      // oxlint-disable-next-line sonarjs/no-hardcoded-ip -- IPv4-mapped documentation address.
      await identity("::ffff:192.0.2.1", { "x-forwarded-for": "198.51.100.7" }, "192.0.2.0/24"),
    ).toBe(await identity("198.51.100.7"));
  });

  it("keeps non-mapped IPv6 addresses with a similar prefix intact", async () => {
    // oxlint-disable-next-line sonarjs/no-hardcoded-ip -- Synthetic IPv6 proxy identity, no network request.
    const proxy = "::ffff:0:c000:201";
    expect(await identity(proxy, { "x-forwarded-for": "198.51.100.7" }, proxy)).toBe(
      await identity("198.51.100.7"),
    );
  });

  it.each(["", "invalid", "198.51.100.7, invalid", "198.51.100.7,", "2001:db8::1%eth0"])(
    "does not use malformed forwarded addresses: %s",
    async (forwarded) => {
      expect(await identity("192.0.2.1", { "x-forwarded-for": forwarded }, "192.0.2.0/24")).toBe(
        await identity("192.0.2.1"),
      );
    },
  );

  it("does not trust headers when no transport address is available", async () => {
    expect(await identity(undefined, { "x-forwarded-for": "198.51.100.7" }, "192.0.2.0/24")).toBe(
      await identity(undefined),
    );
  });

  it("enforces the login limit despite changing headers and permits another direct client", async () => {
    const context = await createTestContext(
      createConfiguration({ APP_ENV: "testing", LOGIN_MAX_ATTEMPTS: "1" }),
    );
    await context.auth.setupPassword("test-library-password");
    const app = createApp(context);
    const request = (peer: string, forwarded: string, password: string) =>
      app.request(
        "/api/auth",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": forwarded,
            "cf-connecting-ip": forwarded,
          },
          body: JSON.stringify({ password }),
        },
        peerBindings(peer),
      );
    expect((await request("192.0.2.1", "198.51.100.1", "wrong-password")).status).toBe(401);
    expect((await request("192.0.2.1", "198.51.100.2", "wrong-password")).status).toBe(429);
    expect((await request("192.0.2.2", "198.51.100.1", "test-library-password")).status).toBe(200);
  });
});
