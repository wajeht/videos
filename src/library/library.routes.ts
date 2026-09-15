import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import type { AppContext } from "../context.js";
import {
  libraryQuerySchema,
  libraryResponseSchema,
  thumbnailRegenerationResponseSchema,
  videoDetailEnvelopeSchema,
  videoParametersSchema,
} from "./library.schema.js";

export function createLibraryRouter(context: AppContext) {
  return new Hono()
    .basePath("/library")
    .get("/", zValidator("query", libraryQuerySchema), async (c) =>
      c.json(
        libraryResponseSchema.parse(
          await context.forProfile(c.get("profile").id).library.getLibrary(c.req.valid("query")),
        ),
      ),
    );
}

export function createVideoRouter(context: AppContext) {
  return new Hono()
    .basePath("/videos")
    .get(
      "/:videoId",
      zValidator("param", videoParametersSchema, (result, c) => {
        if (!result.success) return c.json({ message: "Video not found" }, 404);
      }),
      async (c) => {
        const video = await context
          .forProfile(c.get("profile").id)
          .library.getVideo(c.req.valid("param").videoId);
        return video
          ? c.json(videoDetailEnvelopeSchema.parse(video))
          : c.json({ message: "Video not found" }, 404);
      },
    )
    .post(
      "/:videoId/thumbnail",
      zValidator("param", videoParametersSchema, (result, c) => {
        if (!result.success) return c.json({ message: "Video not found" }, 404);
      }),
      async (c) => {
        const videoId = c.req.valid("param").videoId;
        const video = await context.scannerLibraryRepository.getVideo(videoId);
        if (!video) return c.json({ message: "Video not found" }, 404);
        const chapters = await context
          .forProfile(c.get("profile").id)
          .libraryRepository.listVideoChapters(videoId);
        const status = context.thumbnails.startRegeneration(
          video,
          chapters.map((chapter) => ({
            videoId,
            startSeconds: Number(chapter.start_seconds),
            sortOrder: Number(chapter.sort_order),
          })),
        );
        return c.json(thumbnailRegenerationResponseSchema.parse(status), 202);
      },
    )
    .get(
      "/:videoId/thumbnail",
      zValidator("param", videoParametersSchema, (result, c) => {
        if (!result.success) return c.json({ message: "Video not found" }, 404);
      }),
      async (c) => {
        const videoId = c.req.valid("param").videoId;
        if (!(await context.scannerLibraryRepository.getVideo(videoId))) {
          return c.json({ message: "Video not found" }, 404);
        }
        return c.json(
          thumbnailRegenerationResponseSchema.parse(context.thumbnails.regenerationStatus(videoId)),
        );
      },
    );
}
