import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import type { Configuration } from "../config.js";
import { hasErrorCode } from "../errors.js";
import { logCause, type Logger } from "../logger.js";
import { ffmpegExecutable } from "./executables.js";
import { mapLimit } from "./map-limit.js";
import { resolveContainedPath } from "./path.js";
import type { PlaylistRecord } from "./types.js";

const execFileAsync = promisify(execFile);
const playlistCoverConcurrency = 2;
const playlistIdPattern = /^[a-f0-9]{24}$/;

export const playlistCoverCacheVersion = 1;

export function playlistCoversDirectory(dataDirectory: string): string {
  return path.join(dataDirectory, "playlist-covers");
}

const playlistCoverMetaSchema = z.object({
  sourcePath: z.string().min(1),
  modifiedAt: z.iso.datetime(),
  sizeBytes: z.number().int().nonnegative(),
  version: z.literal(playlistCoverCacheVersion),
  revision: z.number().int().nonnegative(),
});

export type PlaylistCoverMeta = z.infer<typeof playlistCoverMetaSchema>;

export type PlaylistCoverGenerator = (source: string, destination: string) => Promise<void>;

export interface PlaylistCoverCache {
  listPlaylistCoverIndex(): Promise<{ revisions: Map<string, number> }>;
  synchronize(playlists: PlaylistRecord[]): Promise<void>;
}

function playlistCoverDirectory(directory: string, playlistId: string): string {
  return path.join(directory, playlistId);
}

function revisionDirectory(directory: string, playlistId: string, revision: number): string {
  return path.join(playlistCoverDirectory(directory, playlistId), String(revision));
}

export function playlistCoverRelativePath(playlistId: string, revision: number): string {
  return path.join(playlistId, String(revision), "cover.jpg");
}

export function playlistCoverPath(directory: string, playlistId: string, revision: number): string {
  return path.join(directory, playlistCoverRelativePath(playlistId, revision));
}

export async function generatePlaylistCover(source: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await execFileAsync(
    ffmpegExecutable,
    [
      "-v",
      "error",
      "-i",
      source,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:360:force_original_aspect_ratio=increase,crop=640:360",
      "-q:v",
      "3",
      "-an",
      "-y",
      destination,
    ],
    { timeout: 60_000 },
  );
}

export function createPlaylistCoverCache({
  configuration,
  logger,
  generate = generatePlaylistCover,
}: {
  configuration: Configuration;
  logger: Logger;
  generate?: PlaylistCoverGenerator;
}): PlaylistCoverCache {
  const directory = playlistCoversDirectory(configuration.media.dataDirectory);
  const metas = new Map<string, PlaylistCoverMeta>();
  const locks = new Map<string, Promise<unknown>>();
  let loaded = false;
  let loading: Promise<void> | null = null;

  function metaPath(playlistId: string): string {
    return path.join(playlistCoverDirectory(directory, playlistId), "current.json");
  }

  async function readMeta(playlistId: string): Promise<PlaylistCoverMeta | null> {
    try {
      const parsed = playlistCoverMetaSchema.safeParse(
        JSON.parse(await fs.readFile(metaPath(playlistId), "utf8")),
      );
      return parsed.success ? parsed.data : null;
    } catch (error) {
      if (hasErrorCode(error, "ENOENT") || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async function hasCompleteRevision(
    playlistId: string,
    meta: PlaylistCoverMeta,
  ): Promise<boolean> {
    try {
      await fs.access(playlistCoverPath(directory, playlistId, meta.revision));
      return true;
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return false;
      throw error;
    }
  }

  async function loadIndex(): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) {
        loaded = true;
        return;
      }
      throw error;
    }
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && playlistIdPattern.test(entry.name))
        .map(async (entry) => {
          const meta = await readMeta(entry.name);
          if (meta && (await hasCompleteRevision(entry.name, meta))) metas.set(entry.name, meta);
        }),
    );
    loaded = true;
  }

  async function ensureIndex(): Promise<void> {
    if (loaded) return;
    loading ??= loadIndex().finally(() => {
      loading = null;
    });
    await loading;
  }

  function withPlaylistLock<T>(playlistId: string, operation: () => Promise<T>): Promise<T> {
    const previous = locks.get(playlistId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    locks.set(playlistId, current);
    const release = () => {
      if (locks.get(playlistId) === current) locks.delete(playlistId);
    };
    void current.then(release, release);
    return current;
  }

  async function removePlaylistCover(playlistId: string): Promise<void> {
    await fs.rm(playlistCoverDirectory(directory, playlistId), { recursive: true, force: true });
    metas.delete(playlistId);
  }

  async function storedPlaylistIds(): Promise<Set<string>> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      return new Set(
        entries
          .filter((entry) => entry.isDirectory() && playlistIdPattern.test(entry.name))
          .map((entry) => entry.name),
      );
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return new Set();
      throw error;
    }
  }

  async function cleanupRevisions(
    playlistId: string,
    currentRevision: number,
    previousRevision: number | undefined,
  ): Promise<void> {
    try {
      const entries = await fs.readdir(playlistCoverDirectory(directory, playlistId), {
        withFileTypes: true,
      });
      const retained = new Set([currentRevision, previousRevision]);
      await Promise.all(
        entries
          .filter(
            (entry) =>
              entry.isDirectory() && /^\d+$/.test(entry.name) && !retained.has(Number(entry.name)),
          )
          .map((entry) =>
            fs.rm(path.join(playlistCoverDirectory(directory, playlistId), entry.name), {
              recursive: true,
              force: true,
            }),
          ),
      );
    } catch (error) {
      logger.warn("Could not prune old playlist cover revisions", {
        playlistId,
        error: logCause(error),
      });
    }
  }

  async function writePlaylistCover(
    playlist: PlaylistRecord,
    sourcePath: string,
    source: string,
    modifiedAt: string,
    sizeBytes: number,
  ): Promise<void> {
    const playlistDirectory = playlistCoverDirectory(directory, playlist.id);
    const stagingDirectory = path.join(playlistDirectory, `.staging-${randomUUID()}`);
    const previousRevision = metas.get(playlist.id)?.revision;
    const revision = Math.max(Date.now(), (previousRevision ?? 0) + 1);
    const publishedDirectory = revisionDirectory(directory, playlist.id, revision);
    const temporaryMeta = path.join(playlistDirectory, `.current-${randomUUID()}.json`);
    let published = false;
    await fs.mkdir(stagingDirectory, { recursive: true });
    try {
      await generate(source, path.join(stagingDirectory, "cover.jpg"));
      await fs.rename(stagingDirectory, publishedDirectory);
      published = true;
      const meta: PlaylistCoverMeta = {
        sourcePath,
        modifiedAt,
        sizeBytes,
        version: playlistCoverCacheVersion,
        revision,
      };
      await fs.writeFile(temporaryMeta, JSON.stringify(meta));
      await fs.rename(temporaryMeta, metaPath(playlist.id));
      metas.set(playlist.id, meta);
      await cleanupRevisions(playlist.id, revision, previousRevision);
    } catch (error) {
      if (published) await fs.rm(publishedDirectory, { recursive: true, force: true });
      throw error;
    } finally {
      await Promise.all([
        fs.rm(stagingDirectory, { recursive: true, force: true }),
        fs.rm(temporaryMeta, { force: true }),
      ]);
    }
  }

  async function synchronizePlaylist(playlist: PlaylistRecord): Promise<void> {
    const sourcePath = playlist.coverPath;
    if (!sourcePath) return;
    const source = await resolveContainedPath(configuration.media.videosDirectory, sourcePath);
    const statistics = await fs.stat(source);
    const modifiedAt = statistics.mtime.toISOString();
    const current = metas.get(playlist.id);
    if (
      current?.sourcePath === sourcePath &&
      current.modifiedAt === modifiedAt &&
      current.sizeBytes === statistics.size &&
      (await hasCompleteRevision(playlist.id, current))
    ) {
      return;
    }
    await writePlaylistCover(playlist, sourcePath, source, modifiedAt, statistics.size);
  }

  return {
    async listPlaylistCoverIndex() {
      await ensureIndex();
      return { revisions: new Map([...metas].map(([id, meta]) => [id, meta.revision])) };
    },

    async synchronize(playlists) {
      await fs.mkdir(directory, { recursive: true });
      await ensureIndex();
      const withCovers = playlists.filter((playlist) => playlist.coverPath);
      const retained = new Set(withCovers.map((playlist) => playlist.id));
      const stored = await storedPlaylistIds();
      await Promise.all(
        [...stored]
          .filter((playlistId) => !retained.has(playlistId))
          .map((playlistId) => withPlaylistLock(playlistId, () => removePlaylistCover(playlistId))),
      );

      await mapLimit(withCovers, playlistCoverConcurrency, async (playlist) => {
        try {
          await withPlaylistLock(playlist.id, () => synchronizePlaylist(playlist));
        } catch (error) {
          logger.warn("Could not generate playlist cover", {
            playlistId: playlist.id,
            path: playlist.coverPath,
            error: logCause(error),
          });
        }
      });
    },
  };
}
