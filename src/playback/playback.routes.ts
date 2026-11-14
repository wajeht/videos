import { zValidator } from "@hono/zod-validator";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";

import type { AppContext } from "../context.js";
import { playbackParametersSchema, playbackResponseSchema } from "./playback.schema.js";

const requireSameOrigin: MiddlewareHandler = async (c, next) => {
  const requestOrigin = new URL(c.req.url).origin;
  if (
    c.req.header("sec-fetch-site") === "same-origin" ||
    c.req.header("origin") === requestOrigin
  ) {
    await next();
    return;
  }
  return c.text("Forbidden", 403);
};

export function createPlaybackRouter(context: AppContext) {
  return new Hono()
    .basePath("/playback")
    .post("/:videoId", zValidator("param", playbackParametersSchema), async (c) => {
      const playback = await context.playback.preparePlayback(c.req.valid("param").videoId);
      return playback
        ? c.json(playbackResponseSchema.parse(playback))
        : c.json({ message: "Video not found" }, 404);
    })
    .get(
      "/:videoId",
      requireSameOrigin,
      zValidator("param", playbackParametersSchema),
      async (c) => {
        const playback = await context.playback.preparePlayback(c.req.valid("param").videoId);
        return playback
          ? c.json(playbackResponseSchema.parse(playback))
          : c.json({ message: "Video not found" }, 404);
      },
    )
    .get("/:videoId/conversion", zValidator("param", playbackParametersSchema), async (c) => {
      const playback = await context.playback.getConversionStatus(c.req.valid("param").videoId);
      return playback
        ? c.json(playbackResponseSchema.parse(playback))
        : c.json({ message: "Conversion not found" }, 404);
    })
    .post("/:videoId/retry", zValidator("param", playbackParametersSchema), async (c) => {
      const playback = await context.playback.retryConversion(c.req.valid("param").videoId);
      return playback
        ? c.json(playbackResponseSchema.parse(playback))
        : c.json({ message: "Video not found" }, 404);
    });
}
