import { z } from "zod";

import { identifierSchema } from "../library/library.schema.js";

export const playbackParametersSchema = z.object({ videoId: identifierSchema });

export const playbackResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("direct"), url: z.string() }),
  z.object({
    kind: z.literal("hls"),
    url: z.string(),
    status: z.enum(["converting", "ready"]),
    progress: z.number().min(0).max(100),
    availableSeconds: z.number().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("converting"),
    status: z.enum(["queued", "converting"]),
    progress: z.number().min(0).max(100),
  }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
