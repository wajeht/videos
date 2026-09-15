import { Hono } from "hono";

import { requireAdmin } from "../auth/auth.routes.js";
import type { AppContext } from "../context.js";

export function createScanRouter(context: AppContext) {
  return new Hono()
    .basePath("/scan")
    .get("/", (c) => c.json(context.scanner.scanStatus()))
    .post("/", requireAdmin, async (c) => c.json(await context.scanner.scanLibrary()));
}
