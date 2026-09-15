import { createProfilesRouter } from "./profiles/profiles.routes.js";
import { Hono } from "hono";

import type { AppContext } from "./context.js";
import { createAuthRouter, createRequireAuth, createRequireProfile } from "./auth/auth.routes.js";
import { createLibraryRouter, createVideoRouter } from "./library/library.routes.js";
import { createScanRouter } from "./media/scan.routes.js";
import { createPlaybackRouter } from "./playback/playback.routes.js";
import { createProgressRouter } from "./progress/progress.routes.js";
import { createSettingsRouter } from "./settings/settings.routes.js";

export function createApiRouter(context: AppContext) {
  return new Hono()
    .route("/", createAuthRouter(context))
    .use("*", createRequireAuth(context))
    .route("/", createProfilesRouter(context))
    .use("*", createRequireProfile(context))
    .route("/", createLibraryRouter(context))
    .route("/", createVideoRouter(context))
    .route("/", createProgressRouter(context))
    .route("/", createPlaybackRouter(context))
    .route("/", createSettingsRouter(context))
    .route("/", createScanRouter(context));
}
