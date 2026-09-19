import crypto from "node:crypto";
import { BlockList, isIP, SocketAddress } from "node:net";

import type { HttpBindings } from "@hono/node-server";
import type { Context } from "hono";

import type { Configuration } from "../config.js";

function normalizedAddress(address: string): string | null {
  const family = isIP(address);
  if (!family || address.includes("%")) return null;
  const normalized = new SocketAddress({
    address,
    family: family === 4 ? "ipv4" : "ipv6",
  }).address;
  const mapped = normalized.slice(7);
  return normalized.startsWith("::ffff:") && isIP(mapped) === 4 ? mapped : normalized;
}

function trustedProxyList(proxies: string[]): BlockList {
  const trusted = new BlockList();
  for (const proxy of proxies) {
    const [address, prefix] = proxy.split("/");
    const family = isIP(address!) === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) trusted.addAddress(address!, family);
    else trusted.addSubnet(address!, Number(prefix), family);
  }
  return trusted;
}

function clientAddress(c: Context, configuration: Configuration): string {
  const bindings: Partial<HttpBindings> | undefined = c.env;
  const rawPeer = bindings?.incoming?.socket.remoteAddress;
  const peer = rawPeer ? normalizedAddress(rawPeer) : null;
  // Requests without a network transport share one bucket and never trust headers.
  if (!peer) return "unknown";
  const forwarded = c.req.header("x-forwarded-for");
  if (!forwarded || !configuration.auth.trustedProxies.length) return peer;

  const trusted = trustedProxyList(configuration.auth.trustedProxies);
  let current = peer;
  for (const rawAddress of forwarded.split(",").reverse()) {
    if (!trusted.check(current, isIP(current) === 4 ? "ipv4" : "ipv6")) break;
    const address = normalizedAddress(rawAddress.trim());
    if (!address) break;
    current = address;
  }
  return current;
}

export function clientKey(c: Context, configuration: Configuration): string {
  return crypto
    .createHmac("sha256", configuration.auth.sessionSecret)
    .update(clientAddress(c, configuration))
    .digest("hex");
}
