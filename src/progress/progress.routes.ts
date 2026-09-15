import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import type { AppContext } from "../context.js";
import {
  playlistProgressParametersSchema,
  progressParametersSchema,
  updateProgressSchema,
} from "./progress.schema.js";

export function createProgressRouter(context: AppContext) {
  return new Hono()
    .basePath("/progress")
    .post("/videos/:videoId/open", zValidator("param", progressParametersSchema), async (c) => {
      const opened = await context
        .forProfile(c.get("profile").id)
        .progress.openVideo(c.req.valid("param").videoId);
      return opened ? c.json({ opened: true }) : c.json({ message: "Video not found" }, 404);
    })
    .put(
      "/videos/:videoId",
      zValidator("param", progressParametersSchema),
      zValidator("json", updateProgressSchema),
      async (c) => {
        const saved = await context
          .forProfile(c.get("profile").id)
          .progress.updateProgress(
            c.req.valid("param").videoId,
            c.req.valid("json").positionSeconds,
          );
        return saved ? c.json({ saved: true }) : c.json({ message: "Video not found" }, 404);
      },
    )
    .post("/videos/:videoId/complete", zValidator("param", progressParametersSchema), async (c) => {
      const saved = await context
        .forProfile(c.get("profile").id)
        .progress.completeVideo(c.req.valid("param").videoId);
      return saved ? c.json({ completed: true }) : c.json({ message: "Video not found" }, 404);
    })
    .delete("/videos/:videoId", zValidator("param", progressParametersSchema), async (c) => {
      await context
        .forProfile(c.get("profile").id)
        .progress.resetVideo(c.req.valid("param").videoId);
      return c.json({ reset: true });
    })
    .delete(
      "/playlists/:playlistId",
      zValidator("param", playlistProgressParametersSchema),
      async (c) => {
        await context
          .forProfile(c.get("profile").id)
          .progress.resetPlaylist(c.req.valid("param").playlistId);
        return c.json({ reset: true });
      },
    );
}
