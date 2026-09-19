import { createHash } from "node:crypto";
import { watch } from "node:fs";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { Configuration } from "../config.js";
import { logCause, type Logger } from "../logger.js";
import type { LibraryRepository, RootEntryOrder } from "./library.repository.js";
import { normalizeMetadataName } from "./metadata.js";
import { displayName, naturalOrder } from "./names.js";
import { posixPath } from "./path.js";
import type { PlaylistCoverCache } from "./playlist-covers.js";
import { readPlaylistMetadata, type PlaylistMetadata } from "./playlist-metadata.js";
import { probeVideo, videoExtensions, type VideoProbe } from "./probe.js";
import type { ThumbnailCache } from "./thumbnails.js";
import type {
  AuthorRecord,
  LibrarySnapshot,
  PlaylistAuthorRecord,
  ScanStatus,
  ScanWarning,
  VideoAuthorRecord,
  VideoRecord,
} from "./types.js";
import { readVideoMetadata, type VideoMetadata } from "./video-metadata.js";

const coverExtensionOrder = [".jpg", ".jpeg", ".png", ".webp"] as const;
const coverExtensions = new Set<string>(coverExtensionOrder);
const playlistCoverNames = ["cover", "playlist"] as const;
const ignoredDirectoryNames = new Set(["@eadir", "#recycle"]);

function isLibraryDirectory(entry: Dirent): boolean {
  return (
    entry.isDirectory() &&
    !entry.name.startsWith(".") &&
    !ignoredDirectoryNames.has(entry.name.toLowerCase())
  );
}

function isVideoFile(entry: Dirent): boolean {
  return entry.isFile() && videoExtensions.has(path.extname(entry.name).toLowerCase());
}

export interface Scanner {
  scanLibrary(): Promise<ScanStatus>;
  scanStatus(): ScanStatus;
  startMonitoring(): () => void;
}

export interface ScannerDependencies {
  configuration: Configuration;
  repository: LibraryRepository;
  logger: Logger;
  probe?: (filename: string) => Promise<VideoProbe>;
  watchDirectory?: WatchDirectory;
  playlistCovers?: PlaylistCoverCache;
  thumbnails?: ThumbnailCache;
}

interface DirectoryWatcher {
  on(event: "error", listener: (error: Error) => void): this;
  close(): void;
}

type WatchDirectory = (
  directory: string,
  options: { recursive: true },
  listener: (event: string, filename: string | Buffer | null) => void,
) => DirectoryWatcher;

interface LibraryEntry {
  entry: Dirent;
  id: string;
  kind: "playlist" | "video";
  path: string;
  sortOrder: number;
}

interface BuiltLibrarySnapshot {
  snapshot: LibrarySnapshot;
  rootOrder: RootEntryOrder[];
}

function identifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function createScanner({
  configuration,
  repository,
  logger,
  probe = probeVideo,
  watchDirectory = watch,
  playlistCovers,
  thumbnails,
}: ScannerDependencies): Scanner {
  let activeSynchronization: Promise<void> | null = null;
  let fullScanInProgress = false;
  let fullScanRequested = false;
  const requestedEntries = new Set<string>();
  const entryWarnings = new Map<string, ScanWarning[]>();
  let currentScanStatus: ScanStatus = {
    status: "idle",
    startedAt: null,
    completedAt: null,
    playlistCount: 0,
    videoCount: 0,
    warnings: [],
    error: null,
  };

  function currentWarnings(): ScanWarning[] {
    return [...entryWarnings.values()].flat();
  }

  function replaceEntryWarnings(
    entryPaths: Iterable<string> | null,
    warnings: ScanWarning[],
  ): void {
    if (entryPaths === null) entryWarnings.clear();
    else for (const entryPath of entryPaths) entryWarnings.delete(entryPath);

    for (const warning of warnings) {
      const owner = warningOwner(warning.path);
      if (!owner) continue;
      const ownedWarnings = entryWarnings.get(owner) ?? [];
      ownedWarnings.push(warning);
      entryWarnings.set(owner, ownedWarnings);
    }
  }

  async function synchronizeSnapshot(
    entryPaths: string[] | undefined,
    scanWarnings: ScanWarning[],
    existingVideos: VideoRecord[],
    entries: LibraryEntry[],
  ): Promise<void> {
    if (!entryPaths) {
      const built = await buildLibrarySnapshot(
        configuration,
        scanWarnings,
        probe,
        existingVideos,
        entries,
      );
      await repository.synchronizeLibrary(built.snapshot);
      replaceEntryWarnings(null, scanWarnings);
      return;
    }

    const storedEntries = await repository.getRootEntries();
    const currentPaths = new Set(entries.map((entry) => entry.path));
    const storedPaths = new Set(storedEntries.map((entry) => entry.path));
    const synchronizedPaths = new Set(entryPaths);
    for (const entry of entries) {
      if (!storedPaths.has(entry.path)) synchronizedPaths.add(entry.path);
    }
    for (const entry of storedEntries) {
      if (!currentPaths.has(entry.path)) synchronizedPaths.add(entry.path);
    }
    const built = await buildLibrarySnapshot(
      configuration,
      scanWarnings,
      probe,
      existingVideos,
      entries,
      synchronizedPaths,
    );
    await repository.synchronizeEntries(
      built.snapshot,
      [...synchronizedPaths].map(identifier),
      built.rootOrder,
    );
    replaceEntryWarnings(synchronizedPaths, scanWarnings);
  }

  async function synchronizeThumbnails(): Promise<void> {
    if (!thumbnails) return;
    try {
      const [videos, chapters] = await Promise.all([
        repository.getVideos(),
        repository.getChapters(),
      ]);
      await thumbnails.synchronize(videos, chapters);
    } catch (error) {
      logger.warn("Thumbnail synchronization failed", { error: logCause(error) });
    }
  }

  async function synchronizePlaylistCovers(): Promise<void> {
    if (!playlistCovers) return;
    try {
      await playlistCovers.synchronize(await repository.getPlaylists());
    } catch (error) {
      logger.warn("Playlist cover synchronization failed", { error: logCause(error) });
    }
  }

  async function scanOnce(entryPaths?: string[]): Promise<ScanStatus> {
    const startedAt = new Date().toISOString();
    const scanWarnings: ScanWarning[] = [];
    const scanning: ScanStatus = {
      status: "scanning",
      startedAt,
      completedAt: null,
      playlistCount: currentScanStatus.playlistCount,
      videoCount: currentScanStatus.videoCount,
      warnings: currentWarnings(),
      error: null,
    };
    currentScanStatus = scanning;

    try {
      const [entries, existingVideos] = await Promise.all([
        readLibraryEntries(configuration),
        repository.getVideos(),
      ]);
      await synchronizeSnapshot(entryPaths, scanWarnings, existingVideos, entries);
      await Promise.all([synchronizePlaylistCovers(), synchronizeThumbnails()]);

      const counts = await repository.getLibraryCounts();
      const complete: ScanStatus = {
        ...scanning,
        ...counts,
        status: "complete",
        completedAt: new Date().toISOString(),
        warnings: currentWarnings(),
      };
      currentScanStatus = complete;
      logger.info("Media scan complete", {
        playlists: complete.playlistCount,
        videos: complete.videoCount,
        warnings: complete.warnings.length,
      });
      return complete;
    } catch (error) {
      const failed: ScanStatus = {
        ...scanning,
        status: "failed",
        completedAt: new Date().toISOString(),
        warnings: currentWarnings(),
        error: error instanceof Error ? error.message : "Media scan failed",
      };
      currentScanStatus = failed;
      logger.error("Media scan failed", { error: logCause(error) });
      return failed;
    }
  }

  async function drainRequests(): Promise<void> {
    while (fullScanRequested || requestedEntries.size > 0) {
      if (fullScanRequested) {
        fullScanRequested = false;
        requestedEntries.clear();
        fullScanInProgress = true;
        try {
          await scanOnce();
        } finally {
          fullScanInProgress = false;
        }
        continue;
      }
      const entryPaths = [...requestedEntries];
      requestedEntries.clear();
      await scanOnce(entryPaths);
    }
  }

  function ensureSynchronization(): Promise<void> {
    if (!activeSynchronization) {
      activeSynchronization = drainRequests().finally(() => {
        activeSynchronization = null;
        if (fullScanRequested || requestedEntries.size > 0) void ensureSynchronization();
      });
    }
    return activeSynchronization;
  }

  async function waitForSynchronization(): Promise<ScanStatus> {
    do {
      await ensureSynchronization();
    } while (activeSynchronization || fullScanRequested || requestedEntries.size > 0);
    return currentScanStatus;
  }

  function requestEntrySynchronization(entryPaths: Iterable<string>): void {
    if (!fullScanRequested) {
      for (const entryPath of entryPaths) requestedEntries.add(entryPath);
    }
    void ensureSynchronization();
  }

  const scanner: Scanner = {
    scanLibrary() {
      if (!fullScanInProgress) {
        fullScanRequested = true;
        requestedEntries.clear();
      }
      return waitForSynchronization();
    },
    scanStatus: () => currentScanStatus,
    startMonitoring() {
      let debounce: NodeJS.Timeout | null = null;
      const changedEntries = new Set<string>();
      const schedule = setInterval(
        () => void scanner.scanLibrary(),
        configuration.media.scanIntervalMs,
      );
      schedule.unref();
      let watcher: DirectoryWatcher;
      try {
        watcher = watchDirectory(
          configuration.media.videosDirectory,
          { recursive: true },
          (_event, filename) => {
            const changedEntry = filename ? watchedEntryPath(posixPath(String(filename))) : null;
            if (changedEntry) changedEntries.add(changedEntry);
            else fullScanRequested = true;

            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
              debounce = null;
              if (fullScanRequested) void ensureSynchronization();
              else requestEntrySynchronization(changedEntries);
              changedEntries.clear();
            }, 750);
            debounce.unref();
          },
        );
      } catch (error) {
        logger.warn("Library watcher unavailable; scheduled scans will continue", {
          error: logCause(error),
        });
        return () => clearInterval(schedule);
      }
      let watcherActive = true;
      watcher.on("error", (error) => {
        if (!watcherActive) return;
        watcherActive = false;
        if (debounce) clearTimeout(debounce);
        watcher.close();
        logger.warn("Library watcher unavailable; scheduled scans will continue", {
          error: logCause(error),
        });
      });

      return () => {
        clearInterval(schedule);
        if (debounce) clearTimeout(debounce);
        if (watcherActive) watcher.close();
      };
    },
  };
  return scanner;
}

function watchedEntryPath(filename: string): string | null {
  const [rootEntry, nested] = filename.split("/");
  if (!rootEntry || rootEntry.startsWith(".")) return null;
  if (ignoredDirectoryNames.has(rootEntry.toLowerCase())) return null;
  if (nested) return rootEntry;
  if (videoExtensions.has(path.extname(rootEntry).toLowerCase())) return rootEntry;
  if (rootEntry.endsWith(".json")) {
    const videoName = rootEntry.slice(0, -".json".length);
    if (videoExtensions.has(path.extname(videoName).toLowerCase())) return videoName;
  }
  return null;
}

function warningOwner(warningPath: string): string | null {
  const [rootEntry] = warningPath.split("/");
  if (!rootEntry) return null;
  if (rootEntry.endsWith(".json")) {
    const videoName = rootEntry.slice(0, -".json".length);
    if (videoExtensions.has(path.extname(videoName).toLowerCase())) return videoName;
  }
  return rootEntry;
}

async function readLibraryEntries(configuration: Configuration): Promise<LibraryEntry[]> {
  const directoryEntries = (
    await fs.readdir(configuration.media.videosDirectory, { withFileTypes: true })
  )
    .filter((entry) => isLibraryDirectory(entry) || isVideoFile(entry))
    .sort((left, right) => naturalOrder(left.name, right.name));

  return directoryEntries.map((entry, sortOrder) => {
    const relativePath = posixPath(entry.name);
    return {
      entry,
      id: identifier(relativePath),
      kind: entry.isDirectory() ? "playlist" : "video",
      path: relativePath,
      sortOrder,
    };
  });
}

async function buildLibrarySnapshot(
  configuration: Configuration,
  warnings: ScanWarning[],
  probe: (filename: string) => Promise<VideoProbe>,
  existingVideos: VideoRecord[],
  entries: LibraryEntry[],
  requestedPaths?: Set<string>,
): Promise<BuiltLibrarySnapshot> {
  const root = configuration.media.videosDirectory;
  const existingVideosByPath = new Map(existingVideos.map((video) => [video.path, video]));
  const snapshot: LibrarySnapshot = {
    playlists: [],
    playlistSections: [],
    videos: [],
    authors: [],
    playlistAuthors: [],
    videoAuthors: [],
    chapters: [],
    skippedVideoIds: [],
  };
  const authorsByName = new Map<string, AuthorRecord>();
  const rootOrder = entries.map(({ id, kind, sortOrder }) => ({ id, kind, sortOrder }));

  for (const entry of entries) {
    if (requestedPaths && !requestedPaths.has(entry.path)) continue;
    if (entry.kind === "video") {
      await appendVideo({
        absolutePath: path.join(root, entry.entry.name),
        root,
        playlistId: null,
        playlistSectionId: null,
        sortOrder: entry.sortOrder,
        snapshot,
        authorsByName,
        warnings,
        probe,
        existingVideosByPath,
      });
    } else {
      await appendPlaylist({
        entry,
        root,
        snapshot,
        authorsByName,
        warnings,
        probe,
        existingVideosByPath,
      });
    }
  }

  return { snapshot, rootOrder };
}

interface AppendPlaylistOptions {
  entry: LibraryEntry;
  root: string;
  snapshot: LibrarySnapshot;
  authorsByName: Map<string, AuthorRecord>;
  warnings: ScanWarning[];
  probe: (filename: string) => Promise<VideoProbe>;
  existingVideosByPath: Map<string, VideoRecord>;
}

async function appendPlaylist(options: AppendPlaylistOptions): Promise<void> {
  const { entry, root, snapshot, warnings } = options;
  const playlistDirectory = path.join(root, entry.entry.name);
  const { metadata, warning } = await readPlaylistMetadata(playlistDirectory);
  if (warning) warnings.push({ path: `${entry.path}/playlist.json`, message: warning });
  const directoryEntries = (await fs.readdir(playlistDirectory, { withFileTypes: true })).sort(
    (left, right) => naturalOrder(left.name, right.name),
  );
  const directVideos = directoryEntries.filter(isVideoFile);
  const sectionEntries = directoryEntries.filter(isLibraryDirectory);
  const playlistCover = await findPlaylistCover(
    playlistDirectory,
    entry.path,
    directoryEntries,
    metadata?.cover,
    warnings,
  );
  let playlistVideoOrder = 0;
  let videoFileCount = directVideos.length;

  for (const video of directVideos) {
    await appendVideo({
      absolutePath: path.join(playlistDirectory, video.name),
      root,
      playlistId: entry.id,
      playlistSectionId: null,
      sortOrder: playlistVideoOrder++,
      snapshot,
      authorsByName: options.authorsByName,
      warnings,
      probe: options.probe,
      existingVideosByPath: options.existingVideosByPath,
    });
  }

  let sectionOrder = 0;
  for (const sectionEntry of sectionEntries) {
    const sectionDirectory = path.join(playlistDirectory, sectionEntry.name);
    const sectionPath = posixPath(path.relative(root, sectionDirectory));
    const sectionDirectoryEntries = (
      await fs.readdir(sectionDirectory, { withFileTypes: true })
    ).sort((left, right) => naturalOrder(left.name, right.name));
    for (const nested of sectionDirectoryEntries.filter(isLibraryDirectory)) {
      warnings.push({
        path: `${sectionPath}/${nested.name}`,
        message: "Directories below playlist sections are unsupported",
      });
    }
    const sectionVideos = sectionDirectoryEntries.filter(isVideoFile);
    if (sectionVideos.length === 0) continue;
    videoFileCount += sectionVideos.length;
    const sectionId = identifier(sectionPath);
    snapshot.playlistSections.push({
      id: sectionId,
      playlistId: entry.id,
      path: sectionPath,
      title: displayName(sectionEntry.name),
      sortOrder: sectionOrder++,
    });
    for (const video of sectionVideos) {
      await appendVideo({
        absolutePath: path.join(sectionDirectory, video.name),
        root,
        playlistId: entry.id,
        playlistSectionId: sectionId,
        sortOrder: playlistVideoOrder++,
        snapshot,
        authorsByName: options.authorsByName,
        warnings,
        probe: options.probe,
        existingVideosByPath: options.existingVideosByPath,
      });
    }
  }

  if (videoFileCount === 0) return;
  appendPlaylistRecord(options, metadata, playlistCover);
}

function appendPlaylistRecord(
  options: AppendPlaylistOptions,
  metadata: PlaylistMetadata | null,
  playlistCover: string | null,
): void {
  const { entry, root, snapshot } = options;
  snapshot.playlists.push({
    id: entry.id,
    path: entry.path,
    title: metadata?.title ?? entry.entry.name,
    description: metadata?.description ?? "",
    tags: metadata?.tags ?? [],
    coverPath: playlistCover ? posixPath(path.relative(root, playlistCover)) : null,
    sourceProvider: metadata?.source?.provider ?? null,
    sourceUrl: metadata?.source?.url ?? null,
    sortOrder: entry.sortOrder,
  });
  appendAuthors(metadata?.authors ?? [], entry.id, "playlist", snapshot, options.authorsByName);
}

interface AppendVideoOptions {
  absolutePath: string;
  root: string;
  playlistId: string | null;
  playlistSectionId: string | null;
  sortOrder: number;
  snapshot: LibrarySnapshot;
  authorsByName: Map<string, AuthorRecord>;
  warnings: ScanWarning[];
  probe: (filename: string) => Promise<VideoProbe>;
  existingVideosByPath: Map<string, VideoRecord>;
}

async function appendVideo(options: AppendVideoOptions): Promise<void> {
  const relativePath = posixPath(path.relative(options.root, options.absolutePath));
  const sidecarPath = `${relativePath}.json`;
  const videoId = identifier(relativePath);
  const { metadata, warning } = await readVideoMetadata(options.absolutePath);
  if (warning) options.warnings.push({ path: sidecarPath, message: warning });

  try {
    const fileStats = await fs.stat(options.absolutePath);
    const modifiedAt = fileStats.mtime.toISOString();
    const existing = options.existingVideosByPath.get(relativePath);
    const probeResult =
      existing && existing.modifiedAt === modifiedAt && existing.sizeBytes === fileStats.size
        ? existing
        : await options.probe(options.absolutePath);
    appendVideoRecord(options, relativePath, videoId, metadata, probeResult, modifiedAt);
    appendVideoChapters(options, relativePath, videoId, sidecarPath, metadata, probeResult);
  } catch (error) {
    options.snapshot.skippedVideoIds.push(videoId);
    options.warnings.push({
      path: relativePath,
      message: error instanceof Error ? error.message : "Could not inspect video",
    });
  }
}

function appendVideoRecord(
  options: AppendVideoOptions,
  relativePath: string,
  videoId: string,
  metadata: VideoMetadata | null,
  probeResult: VideoProbe,
  modifiedAt: string,
): void {
  options.snapshot.videos.push({
    id: videoId,
    path: relativePath,
    playlistId: options.playlistId,
    playlistSectionId: options.playlistSectionId,
    title: metadata?.title ?? displayName(path.basename(options.absolutePath)),
    description: metadata?.description ?? "",
    tags: metadata?.tags ?? [],
    sourceProvider: metadata?.source?.provider ?? null,
    sourceUrl: metadata?.source?.url ?? null,
    sortOrder: options.sortOrder,
    durationSeconds: probeResult.durationSeconds,
    sizeBytes: probeResult.sizeBytes,
    container: probeResult.container,
    videoCodec: probeResult.videoCodec,
    audioCodec: probeResult.audioCodec,
    browserCompatible: probeResult.browserCompatible,
    modifiedAt,
  });
  appendAuthors(metadata?.authors ?? [], videoId, "video", options.snapshot, options.authorsByName);
}

function appendVideoChapters(
  options: AppendVideoOptions,
  relativePath: string,
  videoId: string,
  sidecarPath: string,
  metadata: VideoMetadata | null,
  probeResult: VideoProbe,
): void {
  for (const [chapterIndex, chapter] of (metadata?.chapters ?? []).entries()) {
    if (chapter.startSeconds >= probeResult.durationSeconds) {
      options.warnings.push({
        path: sidecarPath,
        message: `Chapter “${chapter.title}” starts outside ${path.basename(options.absolutePath)}`,
      });
      continue;
    }
    options.snapshot.chapters.push({
      id: identifier(`${relativePath}\0${chapter.startSeconds}`),
      videoId,
      title: chapter.title,
      startSeconds: chapter.startSeconds,
      sortOrder: chapterIndex,
    });
  }
}

function appendAuthors(
  names: string[],
  ownerId: string,
  ownerKind: "playlist" | "video",
  snapshot: LibrarySnapshot,
  authorsByName: Map<string, AuthorRecord>,
): void {
  for (const [sortOrder, name] of names.entries()) {
    const normalizedName = normalizeMetadataName(name);
    let author = authorsByName.get(normalizedName);
    if (!author) {
      author = { id: identifier(`author\0${normalizedName}`), name, normalizedName };
      authorsByName.set(normalizedName, author);
      snapshot.authors.push(author);
    }
    if (ownerKind === "playlist") {
      snapshot.playlistAuthors.push({
        playlistId: ownerId,
        authorId: author.id,
        sortOrder,
      } satisfies PlaylistAuthorRecord);
    } else {
      snapshot.videoAuthors.push({
        videoId: ownerId,
        authorId: author.id,
        sortOrder,
      } satisfies VideoAuthorRecord);
    }
  }
}

async function findPlaylistCover(
  playlistDirectory: string,
  playlistPath: string,
  entries: Dirent[],
  requestedCover: string | undefined,
  warnings: ScanWarning[],
): Promise<string | null> {
  const requestedPath = await findRequestedPlaylistCover(
    playlistDirectory,
    playlistPath,
    requestedCover,
    warnings,
  );
  if (requestedPath) return requestedPath;

  return findDefaultPlaylistCover(playlistDirectory, entries);
}

async function findRequestedPlaylistCover(
  playlistDirectory: string,
  playlistPath: string,
  requestedCover: string | undefined,
  warnings: ScanWarning[],
): Promise<string | null> {
  if (!requestedCover) return null;
  const warningPath = `${playlistPath}/${posixPath(requestedCover)}`;
  const requestedPath = path.resolve(playlistDirectory, requestedCover);
  const relative = path.relative(playlistDirectory, requestedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    warnings.push({ path: warningPath, message: "Cover path leaves the playlist directory" });
    return null;
  }
  if (!coverExtensions.has(path.extname(requestedPath).toLowerCase())) {
    warnings.push({ path: warningPath, message: "Cover must be a JPG, PNG, or WebP image" });
    return null;
  }
  try {
    return (await fs.stat(requestedPath)).isFile() ? requestedPath : null;
  } catch {
    warnings.push({ path: warningPath, message: "Configured cover does not exist" });
    return null;
  }
}

function findDefaultPlaylistCover(playlistDirectory: string, entries: Dirent[]): string | null {
  for (const name of playlistCoverNames) {
    for (const extension of coverExtensionOrder) {
      const entry = entries.find(
        (item) =>
          item.isFile() &&
          path.extname(item.name).toLowerCase() === extension &&
          item.name.slice(0, -extension.length).toLowerCase() === name,
      );
      if (entry) return path.join(playlistDirectory, entry.name);
    }
  }
  return null;
}
