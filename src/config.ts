import path from "node:path";

import { z } from "zod";

const trustedProxiesSchema = z
  .string()
  .default("")
  .transform((value) => (value.trim() ? value.split(",").map((entry) => entry.trim()) : []))
  .pipe(z.array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()])));

const environmentSchema = z.object({
  APP_ENV: z.enum(["development", "testing", "production"]).default("development"),
  APP_HOST: z.string().default("0.0.0.0"),
  APP_PORT: z.coerce.number().int().positive().default(80),
  APP_VUE_PORT: z.coerce.number().int().positive().default(3000),
  VIDEOS_DIR: z.string().default("/Volumes/plex/videos"),
  DATA_DIR: z.string().default("data"),
  SCAN_INTERVAL_MS: z.coerce.number().int().min(10_000).default(300_000),
  QSV_DEVICE: z.string().default("/dev/dri/renderD128"),
  SESSION_SECRET: z.string().min(32).optional(),
  AUTH_SETUP_TOKEN: z.string().min(16).optional(),
  TRUSTED_PROXIES: trustedProxiesSchema,
  SESSION_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60 * 1000),
  SESSION_ABSOLUTE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 24 * 60 * 60 * 1000),
  LOGIN_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
});

export type AppEnvironment = z.infer<typeof environmentSchema>["APP_ENV"];

export interface Configuration {
  app: {
    env: AppEnvironment;
    host: string;
    port: number;
    vuePort: number;
  };
  media: {
    videosDirectory: string;
    dataDirectory: string;
    scanIntervalMs: number;
    qsvDevice: string;
  };
  database: {
    filename: string;
  };
  auth: {
    sessionSecret: string;
    setupToken?: string;
    trustedProxies: string[];
    idleTimeoutMs: number;
    absoluteTimeoutMs: number;
    loginWindowMs: number;
    loginMaxAttempts: number;
  };
}

export function createConfiguration(environment: NodeJS.ProcessEnv = process.env): Configuration {
  const parsed = environmentSchema.parse(environment);
  if (parsed.APP_ENV === "production" && !parsed.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  const dataDirectory = path.resolve(parsed.DATA_DIR);
  const videosDirectory = path.resolve(parsed.VIDEOS_DIR);
  const dataPathFromVideos = path.relative(videosDirectory, dataDirectory);
  if (
    dataPathFromVideos === "" ||
    (dataPathFromVideos !== ".." &&
      !dataPathFromVideos.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(dataPathFromVideos))
  ) {
    throw new Error("DATA_DIR must be outside VIDEOS_DIR");
  }

  return {
    app: {
      env: parsed.APP_ENV,
      host: parsed.APP_HOST,
      port: parsed.APP_PORT,
      vuePort: parsed.APP_VUE_PORT,
    },
    media: {
      videosDirectory,
      dataDirectory,
      scanIntervalMs: parsed.SCAN_INTERVAL_MS,
      qsvDevice: parsed.QSV_DEVICE,
    },
    database: {
      filename:
        parsed.APP_ENV === "testing" ? ":memory:" : path.join(dataDirectory, "videos.sqlite"),
    },
    auth: {
      sessionSecret: parsed.SESSION_SECRET ?? "videos-development-session-secret-change-me",
      setupToken: parsed.AUTH_SETUP_TOKEN,
      trustedProxies: parsed.TRUSTED_PROXIES,
      idleTimeoutMs: parsed.SESSION_IDLE_TIMEOUT_MS,
      absoluteTimeoutMs: parsed.SESSION_ABSOLUTE_TIMEOUT_MS,
      loginWindowMs: parsed.LOGIN_WINDOW_MS,
      loginMaxAttempts: parsed.LOGIN_MAX_ATTEMPTS,
    },
  };
}

export const configuration = createConfiguration();
