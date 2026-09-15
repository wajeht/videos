import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import type { AppContext } from "../context.js";
import { settingsSchema, updateSettingsSchema } from "./settings.schema.js";

export function createSettingsRouter(context: AppContext) {
  return new Hono()
    .basePath("/settings")
    .get("/", async (c) =>
      c.json(
        settingsSchema.parse(await context.forProfile(c.get("profile").id).settings.getSettings()),
      ),
    )
    .put("/", zValidator("json", updateSettingsSchema), async (c) =>
      c.json(
        settingsSchema.parse(
          await context
            .forProfile(c.get("profile").id)
            .settings.updateSettings(c.req.valid("json")),
        ),
      ),
    );
}
