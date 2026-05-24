import { ProviderError } from "@deadlock-mods/common";
import {
  db,
  type Mod,
  ModDownloadRepository,
  ModRepository,
  type NewMod,
} from "@deadlock-mods/database";
import { GameBanana, type FileserverDto } from "@deadlock-mods/shared";
import { createWideEvent, wideEventContext } from "../../lib/logger";
import { resolveFileserverGeo } from "../../services/geo";
import { modCache } from "../../services/mod-cache";
import { ModSyncHooksService } from "../../services/mod-sync-hooks";
import { Provider, providerRegistry } from "../registry";
import type { GameBananaSubmission, GameBananaSubmissionSource } from "./types";
import {
  DEADLOCK_GAME_ID,
  GAME_BANANA_BASE_URL,
  MAPS_CATEGORY_NAME,
} from "./constants";
import {
  buildDownloadSignature,
  buildDownloadSignatureFromPayload,
  buildMetadata,
  categoryFromGameBananaProfile,
  classifyNSFW,
  heroFromGameBananaProfile,
  mapGameBananaFileserverState,
  parseTags,
  submitterDisplayName,
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
        throw new ProviderError(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaIndexSubmission> | null;
      if (!data || !data._aRecords) {
        this.logger
          .withMetadata({ page })
          .debug("No more submissions available");
        return {
          _aRecords: [],
          _aMetadata: { _nRecordCount: 0, _nPerpage: 15, _bIsComplete: true },
        } as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaIndexSubmission>;
      }
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
        throw new ProviderError(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSoundSubmission> | null;
      if (!data || !data._aRecords) {
        this.logger
          .withMetadata({ page })
          .debug("No more sound submissions available");
        return {
          _aRecords: [],
          _aMetadata: { _nRecordCount: 0, _nPerpage: 15, _bIsComplete: true },
        } as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSoundSubmission>;
      }
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
        throw new ProviderError(`HTTP error! status: ${response.status}`);
      }
      const data = (await response.json()) as
        | GameBanana.GameBananaTopSubmission[]
        | null;
      return data ?? [];
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
        throw new ProviderError(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSubmission> | null;
      if (!data || !data._aRecords) {
        return {
          _aRecords: [],
          _aMetadata: { _nRecordCount: 0, _nPerpage: 15, _bIsComplete: true },
        } as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSubmission>;
      }
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
      throw new ProviderError(`HTTP ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as D;
    return data;
  }

  async getMod<
    T extends "Mod" | "Sound" = "Mod",
    D = T extends "Mod"
      ? GameBanana.GameBananaModProfile
      : GameBanana.GameBananaSoundProfile,
  >(remoteId: string, modType: T): Promise<D | null> {
    const response = await fetch(
      `${GAME_BANANA_BASE_URL}/${modType}/${remoteId}/ProfilePage`,
    );
    const data = (await response.json()) as D | null;
    return data;
  }

  async synchronize(): Promise<void> {
    const wide = wideEventContext.get();
    wide?.merge({ provider: "GameBanana" });

    const mods = this.getMods();
    let count = 0;
    let anyFilesUpdated = false;
    let anyContentChanged = false;
    const startTime = Date.now();

    try {
      for await (const { submission, source } of mods) {
        count++;
        const { filesChanged, contentChanged } = await this.createMod(
          submission,
          source,
          { deferListingInvalidation: true },
        );
        if (filesChanged) {
          anyFilesUpdated = true;
        }
        if (contentChanged) {
          anyContentChanged = true;
        }
      }

      if (anyFilesUpdated || anyContentChanged) {
        await modCache.invalidateListing();
      }

      const duration = Date.now() - startTime;
      wide?.merge({
        syncModCount: count,
        syncDurationMs: duration,
        syncModsPerSecond: count / (duration / 1000),
        syncFilesUpdated: anyFilesUpdated,
        syncContentChanged: anyContentChanged,
      });
    } catch (error) {
      wide?.merge({ syncProcessedCount: count });
      throw error;
    }
  }

  async createModPayload(
    mod: GameBananaSubmission,
    source: GameBananaSubmissionSource,
  ): Promise<(NewMod & { isTrashed: boolean }) | null> {
    if (source === "sound") {
      return this.createSoundModPayload(mod);
    }
    return this.createRegularModPayload(mod);
  }

  private async createSoundModPayload(
    mod: GameBananaSubmission,
  ): Promise<(NewMod & { isTrashed: boolean }) | null> {
    const profile = await this.getMod(mod._idRow.toString(), "Sound");

    if (!profile) return null;

    if (profile._bIsTrashed === true) {
      return this.createTrashedPayload(profile);
    }

    const description = profile._sText || profile._sDescription || "";

    return {
      remoteId: profile._idRow.toString(),
      name: profile._sName,
      description,
      tags: parseTags(profile._aTags),
      author: submitterDisplayName(profile),
      likes: profile._nLikeCount ?? 0,
      hero: heroFromGameBananaProfile(profile),
      downloadCount: profile._nDownloadCount ?? 0,
      remoteUrl: profile._sProfileUrl,
      category: categoryFromGameBananaProfile(profile),
      downloadable: (profile._aFiles?.length ?? 0) > 0,
      remoteAddedAt: new Date(profile._tsDateAdded * 1000),
      remoteUpdatedAt: new Date(profile._tsDateModified * 1000),
      images: [],
      isNSFW: classifyNSFW(profile),
      isObsolete: profile._bIsObsolete ?? false,
      isTrashed: false,
      isMap: false,
      isAudio: true,
      audioUrl: profile._aPreviewMedia._aMetadata._sAudioUrl,
      metadata: buildMetadata({
        description,
        isMap: false,
        donationMethods: profile._aSubmitter?._aDonationMethods ?? [],
      }),
    };
  }

  private async createRegularModPayload(
    mod: GameBananaSubmission,
  ): Promise<(NewMod & { isTrashed: boolean }) | null> {
    const profile = await this.getMod(mod._idRow.toString(), "Mod");

    if (!profile) return null;

    if (profile._bIsTrashed === true) {
      return this.createTrashedPayload(profile);
    }

    const description = profile._sText || profile._sDescription || "";
    const category = categoryFromGameBananaProfile(profile);
    const isMap = category === MAPS_CATEGORY_NAME;

    return {
      remoteId: profile._idRow.toString(),
      name: profile._sName,
      description,
      tags: parseTags(profile._aTags),
      author: submitterDisplayName(profile),
      likes: profile._nLikeCount ?? 0,
      hero: heroFromGameBananaProfile(profile),
      downloadCount: profile._nDownloadCount ?? 0,
      remoteUrl: profile._sProfileUrl,
      category,
      downloadable: (profile._aFiles?.length ?? 0) > 0,
      remoteAddedAt: new Date(profile._tsDateAdded * 1000),
      remoteUpdatedAt: new Date(profile._tsDateModified * 1000),
      images:
        profile._aPreviewMedia?._aImages?.map(
          (image) => `${image._sBaseUrl}/${image._sFile}`,
        ) ?? [],
      isNSFW: classifyNSFW(profile),
      isObsolete: profile._bIsObsolete ?? false,
      isTrashed: false,
      isMap,
      isAudio: false,
      metadata: buildMetadata({
        description,
        isMap,
        donationMethods: profile._aSubmitter?._aDonationMethods ?? [],
      }),
    };
  }

  private createTrashedPayload(
    profile:
      | GameBanana.GameBananaModProfile
      | GameBanana.GameBananaSoundProfile,
  ): NewMod & { isTrashed: boolean } {
    return {
      remoteId: profile._idRow.toString(),
      name: profile._sName,
      description: "",
      tags: [],
      author: submitterDisplayName(profile),
      likes: 0,
      hero: null,
      downloadCount: 0,
      remoteUrl: profile._sProfileUrl,
      category: "",
      downloadable: false,
      remoteAddedAt: new Date(profile._tsDateAdded * 1000),
      remoteUpdatedAt: new Date(profile._tsDateModified * 1000),
      images: [],
      isNSFW: false,
      isObsolete: false,
      isTrashed: true,
      isMap: false,
    };
  }

  async createMod(
    mod: GameBananaSubmission,
    source: GameBananaSubmissionSource,
    options?: { deferListingInvalidation?: boolean },
  ): Promise<{
    mod: Mod | undefined;
    filesChanged: boolean;
    contentChanged: boolean;
    handledAsTrashed?: boolean;
  }> {
    const modId = mod._idRow.toString();
    const wide = createWideEvent(this.logger, "mod_sync", {
      modId,
      source,
    });

    try {
      let t0 = Date.now();
      const payload = await this.createModPayload(mod, source);
      wide.set("payloadMs", Date.now() - t0);

      if (!payload) {
        wide.set("outcome_reason", "profile_not_found");
        wide.emit("success");
        return { mod: undefined, filesChanged: false, contentChanged: false };
      }

      if (payload.isTrashed) {
        const { remoteId } = payload;
        const exists = await modRepository.existsByRemoteId(remoteId);
        if (!exists) {
          wide.set("outcome_reason", "trashed_not_in_db");
          wide.emit("success");
          return {
            mod: undefined,
            filesChanged: false,
            contentChanged: false,
            handledAsTrashed: true,
          };
        }
        await modRepository.markAsTrashed(remoteId);
        await modCache.invalidateAfterModSync({
          remoteId,
          filesChanged: false,
          contentChanged: true,
          deferListingInvalidation: options?.deferListingInvalidation,
        });
        wide.set("outcome_reason", "marked_trashed");
        wide.emit("success");
        return {
          mod: undefined,
          filesChanged: false,
          contentChanged: true,
          handledAsTrashed: true,
        };
      }

      t0 = Date.now();
      const { mod: dbMod, contentChanged } =
        await modRepository.upsertByRemoteId(payload);
      wide.set("upsertMs", Date.now() - t0);

      t0 = Date.now();
      const { filesChanged } = await this.refreshModDownloads(dbMod);
      wide.merge({
        downloadsMs: Date.now() - t0,
        filesChanged,
        contentChanged,
      });

      if (filesChanged) {
        const filesUpdatedAt = new Date();
        await modRepository.update(dbMod.id, {
          filesUpdatedAt,
        });
        await ModSyncHooksService.getInstance().onModFilesUpdated(
          dbMod,
          filesUpdatedAt,
        );
      }

      t0 = Date.now();
      await modCache.invalidateAfterModSync({
        remoteId: dbMod.remoteId,
        filesChanged,
        contentChanged,
        deferListingInvalidation: options?.deferListingInvalidation,
      });
      wide.set("cacheMs", Date.now() - t0);

      wide.merge({ modName: dbMod.name, hero: dbMod.hero });
      wide.emit("success");

      return { mod: dbMod, filesChanged, contentChanged };
    } catch (error) {
      wide.emit("error", error);
      return { mod: undefined, filesChanged: false, contentChanged: false };
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
        description: file._sDescription || null,
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
        .debug("Refreshed mod downloads successfully");

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

  async getModById(modId: string): Promise<Mod | null> {
    return await modRepository.findById(modId);
  }

  async getFileservers(): Promise<FileserverDto[]> {
    const response = await fetch(
      `${GAME_BANANA_BASE_URL}/Util/Fileservers?_nPage=1`,
    );
    if (!response.ok) {
      throw new ProviderError(`HTTP error! status: ${response.status}`);
    }
    const json = await response.json();
    const data = GameBanana.GameBananaFileserversResponseSchema.parse(json);
    const records = data._aRecords ?? [];
    const fileservers = records.map((record) => {
      const domain = `${record._sDomain}.gamebanana.com`;
      const hourStats = record._aStats?._a1hr;
      return {
        id: String(record._idRow),
        provider: "gamebanana",
        domain,
        name: record._sDomain,
        state: mapGameBananaFileserverState(record._sState),
        urlTemplate: `https://${domain}/{category}/{filename}`,
        stats: hourStats
          ? {
              rateBytes: Math.max(0, Math.floor(hourStats._fRate)),
              requestsPerHour: Math.max(0, Math.floor(hourStats._nRequests)),
            }
          : undefined,
      };
    });
    this.logger
      .withMetadata({ count: fileservers.length })
      .debug("Mapped GameBanana fileservers");

    const fileserversWithGeo = await Promise.all(
      fileservers.map(async (fs) => {
        if (fs.state === "terminated") {
          return fs;
        }
        const geoResult = await resolveFileserverGeo(fs.domain);
        if (geoResult.isOk()) {
          return { ...fs, geo: geoResult.value };
        }
        return fs;
      }),
    );

    return fileserversWithGeo;
  }
}

providerRegistry.registerProvider("gamebanana", GameBananaProvider);
