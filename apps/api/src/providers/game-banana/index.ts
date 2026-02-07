import {
  db,
  type Mod,
  ModDownloadRepository,
  ModRepository,
  type NewMod,
} from "@deadlock-mods/database";
import { type GameBanana, guessHero } from "@deadlock-mods/shared";
import { cache } from "../../lib/redis";
import { ModSyncHooksService } from "../../services/mod-sync-hooks";
import { Provider, providerRegistry } from "../registry";
import type { GameBananaSubmission, GameBananaSubmissionSource } from "./types";
import { DEADLOCK_GAME_ID, GAME_BANANA_BASE_URL } from "./constants";
import {
  buildDownloadSignature,
  buildDownloadSignatureFromPayload,
  classifyNSFW,
  parseTags,
} from "./utils";

const modRepository = new ModRepository(db);
const modDownloadRepository = new ModDownloadRepository(db);

export class GameBananaProvider extends Provider<GameBananaSubmission> {
  async getAllSubmissions(
    page: number,
  ): Promise<
    GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaIndexSubmission>
  > {
    this.logger.withMetadata({ page }).debug("Fetching all submissions");
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Mod/Index?_nPerpage=15&_aFilters%5BGeneric_Game%5D=${DEADLOCK_GAME_ID}&_nPage=${page}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaIndexSubmission>;
      this.logger
        .withMetadata({ page, count: data._aRecords.length })
        .debug("Fetched all submissions");
      return data;
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ page })
        .error("Failed to fetch submissions");
      throw error;
    }
  }

  async getAllSoundSubmissions(
    page: number,
  ): Promise<
    GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSoundSubmission>
  > {
    this.logger.withMetadata({ page }).debug("Fetching all submissions");
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Sound/Index?_nPerpage=15&_aFilters%5BGeneric_Game%5D=${DEADLOCK_GAME_ID}&_nPage=${page}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSoundSubmission>;
      this.logger
        .withMetadata({ page, count: data._aRecords.length })
        .debug("Fetched all sound submissions");

      return data;
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ page })
        .error("Failed to fetch submissions");
      throw error;
    }
  }

  async getTopSubmissions(): Promise<GameBanana.GameBananaTopSubmission[]> {
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Game/${DEADLOCK_GAME_ID}/TopSubs`,
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaTopSubmission[];
      return data;
    } catch (error) {
      this.logger.withError(error).error("Failed to fetch top submissions");
      throw error;
    }
  }

  async getSubmissions(
    page: number,
  ): Promise<
    GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSubmission>
  > {
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Util/List/Featured?_nPage=${page}&_idGameRow=${DEADLOCK_GAME_ID}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSubmission>;
      return data;
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ page })
        .error("Failed to fetch submissions");
      throw error;
    }
  }

  async *getFeaturedMods(): AsyncGenerator<{
    submission: GameBananaSubmission;
    source: GameBananaSubmissionSource;
  }> {
    let isComplete = false;
    let page = 1;

    while (!isComplete) {
      const submissions = await this.getSubmissions(page);
      for (const submission of submissions._aRecords) {
        yield { submission, source: "featured" };
      }
      isComplete = submissions._aMetadata._bIsComplete;
      page++;
    }
  }

  async *getTopMods(): AsyncGenerator<{
    submission: GameBananaSubmission;
    source: GameBananaSubmissionSource;
  }> {
    const submissions = await this.getTopSubmissions();
    for (const submission of submissions) {
      yield { submission, source: "top" };
    }
  }

  async *getAllMods(): AsyncGenerator<{
    submission: GameBananaSubmission;
    source: GameBananaSubmissionSource;
  }> {
    let isComplete = false;
    let page = 1;

    while (!isComplete) {
      const submissions = await this.getAllSubmissions(page);
      for (const submission of submissions._aRecords) {
        yield { submission, source: "all" };
      }
      isComplete = submissions._aMetadata._bIsComplete;
      page++;
    }
  }

  async *getSoundSubmissions(): AsyncGenerator<{
    submission: GameBanana.GameBananaSoundSubmission;
    source: GameBananaSubmissionSource;
  }> {
    let isComplete = false;
    let page = 1;

    while (!isComplete) {
      const submissions = await this.getAllSoundSubmissions(page);
      for (const submission of submissions._aRecords) {
        yield { submission, source: "sound" };
      }
      isComplete = submissions._aMetadata._bIsComplete;
      page++;
    }
  }

  async *getMods(): AsyncGenerator<{
    submission: GameBananaSubmission;
    source: GameBananaSubmissionSource;
  }> {
    yield* this.getAllMods();
    yield* this.getFeaturedMods(); // These two are most likely redundant, but I haven't checked
    yield* this.getTopMods(); // These two are most likely redundant, but I haven't checked
    yield* this.getSoundSubmissions();
  }

  async getModDownload<D = GameBanana.GameBananaModDownload>(
    remoteId: string,
    modType: "Mod" | "Sound" = "Mod",
  ): Promise<D> {
    const response = await fetch(
      `${GAME_BANANA_BASE_URL}/${modType}/${remoteId}/DownloadPage`,
    );

    if (!response.ok) {
      let errorBody: string;
      try {
        // Try to parse as JSON first
        const errorData = await response.json();
        errorBody = JSON.stringify(errorData);
      } catch {
        // Fall back to text if JSON parsing fails
        errorBody = await response.text();
      }
      throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as D;
    return data;
  }

  async getMod<
    T extends "Mod" | "Sound" = "Mod",
    D = T extends "Mod"
      ? GameBanana.GameBananaModProfile
      : GameBanana.GameBananaSoundProfile,
  >(remoteId: string, modType: T): Promise<D> {
    const response = await fetch(
      `${GAME_BANANA_BASE_URL}/${modType}/${remoteId}/ProfilePage`,
    );
    const data = (await response.json()) as D;
    return data;
  }

  async synchronize(): Promise<void> {
    this.logger.info("Starting GameBanana synchronization");
    const mods = this.getMods();
    let count = 0;
    let anyFilesUpdated = false;
    const startTime = Date.now();

    try {
      for await (const { submission, source } of mods) {
        count++;
        const { mod, filesChanged } = await this.createMod(submission, source);
        if (filesChanged) {
          anyFilesUpdated = true;
        }
        if (mod) {
          this.logger
            .withMetadata({
              name: submission._sName,
              id: submission._idRow,
              source,
            })
            .info("Synchronized GameBanana mod");
        } else {
          this.logger
            .withMetadata({
              name: submission._sName,
              id: submission._idRow,
              source,
            })
            .warn("Failed to create mod, skipping...");
        }
      }

      if (anyFilesUpdated) {
        await cache.del("mods:listing");
      }

      const duration = Date.now() - startTime;
      this.logger
        .withMetadata({
          count,
          durationMs: duration,
          modsPerSecond: count / (duration / 1000),
        })
        .info("Completed GameBanana synchronization");
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({
          processedCount: count,
        })
        .error("Synchronization failed");
      throw error;
    }
  }

  async createModPayload(
    mod: GameBananaSubmission,
    source: GameBananaSubmissionSource,
  ): Promise<NewMod> {
    if (source === "featured") {
      const featuredSubmission = mod as GameBanana.GameBananaSubmission;
      const submission = await this.getMod(
        featuredSubmission._idRow.toString(),
        "Mod",
      );
      return {
        remoteId: featuredSubmission._idRow.toString(),
        name: featuredSubmission._sName,
        description: submission._sText || submission._sDescription || "",
        tags: parseTags(submission._aTags),
        author: featuredSubmission._aSubmitter._sName,
        likes: featuredSubmission._nLikeCount ?? 0,
        hero: guessHero(featuredSubmission._sName),
        downloadCount: submission._nDownloadCount ?? 0,
        remoteUrl: featuredSubmission._sProfileUrl,
        category: featuredSubmission._sModelName,
        downloadable: featuredSubmission._bHasFiles,
        remoteAddedAt: new Date(submission._tsDateAdded * 1000),
        remoteUpdatedAt: new Date(submission._tsDateModified * 1000),
        images: submission._aPreviewMedia._aImages.map(
          (image) => `${image._sBaseUrl}/${image._sFile}`,
        ),
        isNSFW: classifyNSFW(submission),
        isObsolete: submission._bIsObsolete ?? false,
      };
    }

    if (source === "top") {
      const topSubmission = mod as GameBanana.GameBananaTopSubmission;
      const submission = await this.getMod(
        topSubmission._idRow.toString(),
        "Mod",
      );
      return {
        remoteId: topSubmission._idRow.toString(),
        name: topSubmission._sName,
        description: submission._sText || submission._sDescription || "",
        tags: parseTags(submission._aTags),
        author: topSubmission._aSubmitter._sName,
        likes: topSubmission._nLikeCount,
        hero: guessHero(topSubmission._sName),
        downloadCount: submission._nDownloadCount,
        remoteUrl: topSubmission._sProfileUrl,
        category: topSubmission._sModelName,
        downloadable: (submission?._aFiles?.length ?? 0) > 0,
        remoteAddedAt: new Date(submission._tsDateAdded * 1000),
        remoteUpdatedAt: new Date(submission._tsDateModified * 1000),
        images: submission._aPreviewMedia._aImages.map(
          (image) => `${image._sBaseUrl}/${image._sFile}`,
        ),
        isNSFW: classifyNSFW(submission),
        isObsolete: submission._bIsObsolete ?? false,
      };
    }

    if (source === "all") {
      const submission = await this.getMod(mod._idRow.toString(), "Mod");
      return {
        remoteId: submission._idRow.toString(),
        name: submission._sName,
        description: submission._sText || submission._sDescription || "",
        tags: parseTags(submission._aTags),
        author: submission._aSubmitter._sName,
        likes: submission._nLikeCount,
        hero: guessHero(submission._sName),
        downloadCount: submission._nDownloadCount,
        remoteUrl: submission._sProfileUrl,
        category: submission._aCategory._sName,
        downloadable: (submission?._aFiles?.length ?? 0) > 0,
        remoteAddedAt: new Date(submission._tsDateAdded * 1000),
        remoteUpdatedAt: new Date(submission._tsDateModified * 1000),
        images: submission._aPreviewMedia._aImages.map(
          (image) => `${image._sBaseUrl}/${image._sFile}`,
        ),
        isNSFW: classifyNSFW(submission),
        isObsolete: submission._bIsObsolete ?? false,
      };
    }

    if (source === "sound") {
      const submission = await this.getMod(mod._idRow.toString(), "Sound");
      return {
        remoteId: submission._idRow.toString(),
        name: submission._sName,
        description: submission._sText || submission._sDescription || "",
        tags: parseTags(submission._aTags),
        author: submission._aSubmitter._sName,
        likes: submission._nLikeCount,
        hero: guessHero(submission._sName),
        downloadCount: submission._nDownloadCount,
        remoteUrl: submission._sProfileUrl,
        category: submission._aCategory._sName,
        downloadable: (submission?._aFiles?.length ?? 0) > 0,
        remoteAddedAt: new Date(submission._tsDateAdded * 1000),
        remoteUpdatedAt: new Date(submission._tsDateModified * 1000),
        images: [],
        isAudio: true,
        audioUrl: submission._aPreviewMedia._aMetadata._sAudioUrl,
        isNSFW: classifyNSFW(submission),
        isObsolete: submission._bIsObsolete ?? false,
      };
    }

    throw new Error(`Invalid source: ${source}`);
  }

  async createMod(
    mod: GameBananaSubmission,
    source: GameBananaSubmissionSource,
  ): Promise<{ mod: Mod | undefined; filesChanged: boolean }> {
    this.logger
      .withMetadata({
        modId: mod._idRow.toString(),
        source,
      })
      .debug("Creating/updating mod");
    try {
      const payload = await this.createModPayload(mod, source);

      const dbMod = await modRepository.upsertByRemoteId(payload);

      this.logger
        .withMetadata({ modId: dbMod.id })
        .debug("Mod upserted successfully");

      const { filesChanged } = await this.refreshModDownloads(dbMod);
      if (filesChanged) {
        const filesUpdatedAt = new Date();
        await modRepository.update(dbMod.id, {
          filesUpdatedAt,
        });
        await cache.del(`mod:${dbMod.remoteId}`);
        await ModSyncHooksService.getInstance().onModFilesUpdated(
          dbMod,
          filesUpdatedAt,
        );
      }

      return { mod: dbMod, filesChanged };
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({
          error,
          modId: mod._idRow.toString(),
          source,
        })
        .error("Failed to create/update mod");
      return { mod: undefined, filesChanged: false };
    }
  }

  async refreshModDownloads(dbMod: Mod): Promise<{ filesChanged: boolean }> {
    try {
      const download = await this.getModDownload(
        dbMod.remoteId,
        dbMod.isAudio ? "Sound" : "Mod",
      );

      if (!download?._aFiles || download._aFiles.length === 0) {
        this.logger
          .withMetadata({
            modId: dbMod.id,
            remoteId: dbMod.remoteId,
          })
          .warn("No download found for mod");
        return { filesChanged: false };
      }

      const existingDownloads = await modDownloadRepository.findByModId(
        dbMod.id,
      );
      const existingSignature = buildDownloadSignature(existingDownloads);
      const newSignature = buildDownloadSignatureFromPayload(download._aFiles);

      const filesChanged =
        existingDownloads.length > 0 && existingSignature !== newSignature;

      this.logger
        .withMetadata({
          modId: dbMod.id,
          fileCount: download._aFiles.length,
        })
        .debug("Processing mod downloads");

      const downloadEntries = download._aFiles.map((file) => ({
        remoteId: file._idRow.toString(),
        url: file._sDownloadUrl,
        file: file._sFile,
        size: file._nFilesize,
        modId: dbMod.id,
        md5Checksum: file._sMd5Checksum ?? null,
        createdAt: new Date(file._tsDateAdded * 1000),
        updatedAt: new Date(file._tsDateAdded * 1000),
      }));

      await modDownloadRepository.upsertMultipleByModId(
        dbMod.id,
        downloadEntries,
      );

      this.logger
        .withMetadata({
          modId: dbMod.id,
          downloadCount: downloadEntries.length,
          files: downloadEntries.map((d) => d.file),
        })
        .debug("Upserted mod downloads");

      this.logger
        .withMetadata({
          modId: dbMod.id,
          downloadCount: downloadEntries.length,
        })
        .info("Refreshed mod downloads successfully");

      return { filesChanged };
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({
          error,
          modId: dbMod.id,
          remoteId: dbMod.remoteId,
        })
        .error("Failed to refresh mod downloads");
      throw error;
    }
  }

  // Public method to get a mod by ID
  async getModById(modId: string): Promise<Mod | null> {
    return await modRepository.findById(modId);
  }
}

providerRegistry.registerProvider("gamebanana", GameBananaProvider);
