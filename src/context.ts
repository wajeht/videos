import {
  createProfilesRepository,
  type ProfilesRepository,
} from "./profiles/profiles.repository.js";
import fs from "node:fs/promises";
import { createProfilesService, type ProfilesService } from "./profiles/profiles.service.js";

import { createAuthRepository } from "./auth/auth.repository.js";
import { createAuthService, type AuthService } from "./auth/auth.service.js";
import { configuration as defaultConfiguration, type Configuration } from "./config.js";
import { createDatabase, type Database } from "./db/db.js";
import {
  createLibraryApiRepository,
  type LibraryRepository,
} from "./library/library.repository.js";
import { createLibraryService, type LibraryService } from "./library/library.service.js";
import {
  createLibraryRepository,
  type LibraryRepository as ScannerLibraryRepository,
} from "./media/library.repository.js";
import { createConversionManager, type ConversionManager } from "./media/conversion.js";
import { createConversionRepository } from "./media/conversion.repository.js";
import { createPlaylistCoverCache, type PlaylistCoverCache } from "./media/playlist-covers.js";
import { createScanner, type Scanner } from "./media/scanner.js";
import { createThumbnailCache, type ThumbnailCache } from "./media/thumbnails.js";
import { createPlaybackService, type PlaybackService } from "./playback/playback.service.js";
import { createProgressRepository } from "./progress/progress.repository.js";
import { createProgressService, type ProgressService } from "./progress/progress.service.js";
import { createSettingsRepository } from "./settings/settings.repository.js";
import { createSettingsService, type SettingsService } from "./settings/settings.service.js";
import { createLogger, type Logger } from "./logger.js";

export interface AppContext {
  configuration: Configuration;
  logger: Logger;
  database: Database;
  auth: AuthService;
  scannerLibraryRepository: ScannerLibraryRepository;
  profilesRepository: ProfilesRepository;
  profiles: ProfilesService;
  forProfile(profileId: string): {
    libraryRepository: LibraryRepository;
    library: LibraryService;
    progress: ProgressService;
    settings: SettingsService;
  };
  playback: PlaybackService;
  scanner: Scanner;
  conversions: ConversionManager;
  playlistCovers: PlaylistCoverCache;
  thumbnails: ThumbnailCache;
}

export async function createContext(
  configuration: Configuration = defaultConfiguration,
): Promise<AppContext> {
  const logger = createLogger();
  await fs.mkdir(configuration.media.dataDirectory, { recursive: true });
  const database = await createDatabase(configuration, logger);
  const auth = createAuthService(createAuthRepository(database.connection), configuration);
  const scannerLibraryRepository = createLibraryRepository(database.connection);
  const playlistCovers = createPlaylistCoverCache({ configuration, logger });
  const thumbnails = createThumbnailCache({ configuration, logger });
  const profilesRepository = createProfilesRepository(database.connection);
  const profiles = createProfilesService(profilesRepository, configuration);
  function forProfile(profileId: string) {
    const libraryRepository = createLibraryApiRepository(database.connection, profileId);
    const settings = createSettingsService(
      createSettingsRepository(database.connection, profileId),
    );
    const library = createLibraryService(libraryRepository, settings, thumbnails, playlistCovers);
    const progress = createProgressService(
      createProgressRepository(database.connection, profileId),
      libraryRepository,
    );
    return { libraryRepository, library, progress, settings };
  }
  const scanner = createScanner({
    configuration,
    repository: scannerLibraryRepository,
    logger,
    playlistCovers,
    thumbnails,
  });
  const conversions = createConversionManager({
    repository: createConversionRepository(database.connection),
    library: scannerLibraryRepository,
    configuration,
    logger,
  });
  const playback = createPlaybackService(scannerLibraryRepository, conversions);

  return {
    configuration,
    logger,
    database,
    auth,
    scannerLibraryRepository,
    profilesRepository,
    profiles,
    forProfile,
    playback,
    scanner,
    conversions,
    playlistCovers,
    thumbnails,
  };
}
