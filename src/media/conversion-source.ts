import { createHash } from "node:crypto";

import type { VideoRecord } from "./types.js";

export function conversionGeneration(
  video: Pick<VideoRecord, "id" | "modifiedAt" | "sizeBytes">,
): string {
  return createHash("sha256")
    .update(JSON.stringify([video.id, video.modifiedAt, video.sizeBytes]))
    .digest("hex")
    .slice(0, 24);
}
