import { z } from "zod";

export const identifierSchema = z.string().regex(/^[a-f0-9]{24}$/);

const libraryFilterSchema = z
  .union([
    z.string().trim().min(1).max(200),
    z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  ])
  .transform((value) => [...new Set(Array.isArray(value) ? value : [value])]);

export const libraryQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  author: libraryFilterSchema.optional(),
  tag: libraryFilterSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  view: z.enum(["videos", "playlists"]).optional(),
});

export const playlistParametersSchema = z.object({ playlistId: identifierSchema });
export const videoParametersSchema = z.object({ videoId: identifierSchema });

export const thumbnailRegenerationResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle") }),
  z.object({ status: z.literal("running") }),
  z.object({ status: z.literal("complete"), revision: z.number().int().nonnegative() }),
  z.object({ status: z.literal("failed"), message: z.string() }),
]);

const sourceResponseSchema = z.object({ provider: z.string(), url: z.url() }).nullable();

const playlistVideoResponseSchema = z.object({
  id: identifierSchema,
  playlistId: identifierSchema.nullable(),
  title: z.string(),
  coverUrl: z.string().nullable(),
  durationSeconds: z.number().nonnegative(),
  positionSeconds: z.number().nonnegative(),
  completed: z.boolean(),
  progressPercent: z.number().int().min(0).max(100),
});

export const videoResponseSchema = playlistVideoResponseSchema.extend({
  playlistTitle: z.string().nullable(),
  playlistSectionId: identifierSchema.nullable(),
  playlistSectionTitle: z.string().nullable(),
  description: z.string(),
  authors: z.array(z.string()),
  tags: z.array(z.string()),
  source: sourceResponseSchema,
});

export const chapterResponseSchema = z.object({
  title: z.string(),
  startSeconds: z.number().int().nonnegative(),
  thumbnailUrl: z.string().nullable(),
});

export const videoDetailResponseSchema = videoResponseSchema.extend({
  chapters: z.array(chapterResponseSchema),
});

export const playlistResponseSchema = z.object({
  id: identifierSchema,
  title: z.string(),
  description: z.string(),
  authors: z.array(z.string()),
  tags: z.array(z.string()),
  source: sourceResponseSchema,
  coverUrl: z.string().nullable(),
  videoCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  progressPercent: z.number().int().min(0).max(100),
  durationSeconds: z.number().nonnegative(),
  nextVideoId: identifierSchema,
});

export const playlistDetailResponseSchema = playlistResponseSchema.extend({
  sections: z.array(
    z.object({
      id: identifierSchema.nullable(),
      title: z.string(),
      videos: z.array(playlistVideoResponseSchema),
    }),
  ),
});

const filterResponseSchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
});

export const libraryResponseSchema = z.object({
  videos: z.array(videoResponseSchema),
  playlists: z.array(playlistResponseSchema),
  authors: z.array(filterResponseSchema),
  tags: z.array(filterResponseSchema),
  continueWatching: z.array(videoResponseSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    totalVideos: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const videoDetailEnvelopeSchema = z.object({
  video: videoDetailResponseSchema,
  playlist: playlistDetailResponseSchema.nullable(),
});
