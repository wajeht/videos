import type { ErrorHandler, MiddlewareHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppEnvironment } from "./config.js";
import type { Logger } from "./logger.js";

interface AppMiddleware {
  apiCache: MiddlewareHandler;
  notFound: NotFoundHandler;
  onError: ErrorHandler;
  requestLogger: MiddlewareHandler;
}

export function createMiddleware(logger: Logger, environment: AppEnvironment): AppMiddleware {
  return {
    requestLogger: async (c, next) => {
      const start = performance.now();
      await next();
      const successfulMediaRequest =
        c.res.status < 400 && (c.req.path.startsWith("/media/") || c.req.path.startsWith("/hls/"));
      if (successfulMediaRequest) return;
      logger.info("request", {
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - start),
      });
    },
    apiCache: async (c, next) => {
      c.header("Cache-Control", "private, no-store");
      await next();
    },
    notFound: (c) =>
      c.req.path === "/api" || c.req.path.startsWith("/api/")
        ? c.json({ message: "Resource not found" }, 404)
        : c.text("Not found", 404),
    onError: (error, c) => {
      let status: ContentfulStatusCode = 500;
      if (error instanceof HTTPException) status = error.status;
      if (status >= 500) logger.error("request failed", { error, path: c.req.path });
      const message =
        status === 500 && environment === "production"
          ? "The server could not complete the request"
          : error.message;
      return c.json({ message }, status);
    },
  };
}
