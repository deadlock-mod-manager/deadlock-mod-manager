import { ProviderError } from "@deadlock-mods/common";
import {
  db,
  type Mod,
  ModAuthorRepository,
  ModDownloadRepository,
  ModRepository,
  type NewMod,
  type NewModAuthor,
} from "@deadlock-mods/database";
import { GameBanana, type FileserverDto } from "@deadlock-mods/shared";
import { createWideEvent, wideEventContext } from "../../lib/logger";
import { resolveFileserverGeo } from "../../services/geo";
import { modCache } from "../../services/mod-cache";
import { ModSyncHooksService } from "../../services/mod-sync-hooks";
import { Provider, providerRegistry } from "../registry";
import { assertGameBananaResponseOk } from "./response";
import { assertProfileFresh, fetchDetailPage } from "./detail";
import type {
  GameBananaListedSubmission,
  GameBananaProfileSkip,
  GameBananaSubmission,
  GameBananaSubmissionSource,
} from "./types";
import {
  DEADLOCK_GAME_ID,
  GAME_BANANA_BASE_URL,
  INDEX_PAGE_SIZE,
  MAPS_CATEGORY_NAME,
  SYNC_REFRESH_BATCH_SIZE,
} from "./constants";
import {
  buildDownloadSignature,
  buildDownloadSignatureFromPayload,
  buildMetadata,
  buildModAuthor,
  categoryFromGameBananaProfile,
  classifyNSFW,
  gameBananaTimestampToDate,
  heroFromGameBananaProfile,
  indexListingChanged,
  isUnavailableProfile,
  mapGameBananaFileserverState,
  parseRequirements,
  parseTags,
  resolveRemoteTimestamps,
  submitterDisplayName,
} from "./utils";

const modRepository = new ModRepository(db);
const modAuthorRepository = new ModAuthorRepository(db);
const modDownloadRepository = new ModDownloadRepository(db);

type GameBananaModPayload = NewMod & {
  isTrashed: boolean;
  modAuthor?: NewModAuthor;
};

export class GameBananaProvider extends Provider<GameBananaSubmission> {
  async getAllSubmissions(
    page: number,
  ): Promise<
    GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaIndexSubmission>
  > {
    this.logger.withMetadata({ page }).debug("Fetching all submissions");
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Mod/Index?_nPerpage=${INDEX_PAGE_SIZE}&_aFilters%5BGeneric_Game%5D=${DEADLOCK_GAME_ID}&_nPage=${page}`,
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
          _aMetadata: {
            _nRecordCount: 0,
            _nPerpage: INDEX_PAGE_SIZE,
            _bIsComplete: true,
          },
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
        `${GAME_BANANA_BASE_URL}/Sound/Index?_nPerpage=${INDEX_PAGE_SIZE}&_aFilters%5BGeneric_Game%5D=${DEADLOCK_GAME_ID}&_nPage=${page}`,
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
          _aMetadata: {
            _nRecordCount: 0,
            _nPerpage: INDEX_PAGE_SIZE,
            _bIsComplete: true,
          },
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

  async *getIndexPages(): AsyncGenerator<{
    submissions: GameBananaListedSubmission[];
    source: GameBananaSubmissionSource;
  }> {
    yield* this.paginate((page) => this.getAllSubmissions(page), "all");
    yield* this.paginate((page) => this.getAllSoundSubmissions(page), "sound");
  }

  private async *paginate(
    fetchPage: (
      page: number,
    ) => Promise<
      GameBanana.GameBananaPaginatedResponse<GameBananaListedSubmission>
    >,
    source: GameBananaSubmissionSource,
  ): AsyncGenerator<{
    submissions: GameBananaListedSubmission[];
    source: GameBananaSubmissionSource;
  }> {
    let isComplete = false;
    let page = 1;

    while (!isComplete) {
      const response = await fetchPage(page);
      yield { submissions: response._aRecords, source };
      isComplete = response._aMetadata._bIsComplete;
      page++;
    }
  }

  async getModDownload<D = GameBanana.GameBananaModDownload>(
    remoteId: string,
    modType: "Mod" | "Sound" = "Mod",
    indexModifiedAt?: number,
  ): Promise<D> {
    const response = await fetchDetailPage(
      remoteId,
      modType,
      "DownloadPage",
      indexModifiedAt,
    );

    await assertGameBananaResponseOk(response);

    const data = (await response.json()) as D;
    return data;
  }

  async getMod<
    T extends "Mod" | "Sound" = "Mod",
    D = T extends "Mod"
      ? GameBanana.GameBananaModProfile
      : GameBanana.GameBananaSoundProfile,
  >(remoteId: string, modType: T, indexModifiedAt?: number): Promise<D | null> {
    const response = await fetchDetailPage(
      remoteId,
      modType,
      "ProfilePage",
      indexModifiedAt,
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new ProviderError(
        `HTTP ${response.status} fetching ${modType} ${remoteId}`,
      );
    }
    const data = (await response.json()) as D | null;
    return data;
  }

  async synchronize(): Promise<void> {
    const wide = wideEventContext.get();
    wide?.merge({ provider: "GameBanana" });

    let listedCount = 0;
    let changedCount = 0;
    let refreshedCount = 0;
    let anyFilesUpdated = false;
    let anyContentChanged = false;
    const startTime = Date.now();

    // A swallowed error leaves the mod unmarked, so the next run retries it
    const syncSubmission = async (
      submission: GameBananaSubmission,
      source: GameBananaSubmissionSource,
      indexModifiedAt?: Date,
    ) => {
      const result = await this.createMod(submission, source, {
        deferListingInvalidation: true,
      });
      anyFilesUpdated ||= result.filesChanged;
      anyContentChanged ||= result.contentChanged;
      if (result.mod || result.handledAsTrashed || result.skipped) {
        await modRepository.markSynced(
          submission._idRow.toString(),
          indexModifiedAt,
        );
      }
    };

    try {
      for await (const { submissions, source } of this.getIndexPages()) {
        listedCount += submissions.length;
        const stored = await modRepository.findIndexModifiedAtByRemoteIds(
          submissions.map((submission) => submission._idRow.toString()),
        );
        for (const submission of submissions) {
          const listedModifiedAt = gameBananaTimestampToDate(
            submission._tsDateModified,
          );
          if (
            !indexListingChanged(
              listedModifiedAt,
              stored.get(submission._idRow.toString()),
            )
          ) {
            continue;
          }
          changedCount++;
          await syncSubmission(
            submission,
            source,
            listedModifiedAt ?? undefined,
          );
        }
      }

      const stale = await modRepository.findLeastRecentlySynced(
        SYNC_REFRESH_BATCH_SIZE,
      );
      for (const { remoteId, isAudio } of stale) {
        refreshedCount++;
        await syncSubmission(
          { _idRow: Number(remoteId) } as GameBananaSubmission,
          isAudio ? "sound" : "all",
        );
      }

      if (anyFilesUpdated || anyContentChanged) {
        await modCache.invalidateListing();
      }

      wide?.merge({
        syncListedCount: listedCount,
        syncChangedCount: changedCount,
        syncRefreshedCount: refreshedCount,
        syncDurationMs: Date.now() - startTime,
        syncFilesUpdated: anyFilesUpdated,
        syncContentChanged: anyContentChanged,
      });
    } catch (error) {
      wide?.merge({
        syncListedCount: listedCount,
        syncChangedCount: changedCount,
        syncRefreshedCount: refreshedCount,
      });
      throw error;
    }
  }

  async createModPayload(
    mod: GameBananaSubmission,
    source: GameBananaSubmissionSource,
  ): Promise<GameBananaModPayload | GameBananaProfileSkip> {
    if (source === "sound") {
      return this.createSoundModPayload(mod);
    }
    return this.createRegularModPayload(mod);
  }

  private async createSoundModPayload(
    mod: GameBananaSubmission,
  ): Promise<GameBananaModPayload | GameBananaProfileSkip> {
    const profile = await this.getMod(
      mod._idRow.toString(),
      "Sound",
      mod._tsDateModified,
    );

    if (!profile) return "not_found";

    assertProfileFresh(profile._tsDateModified, mod._tsDateModified);

    if (profile._bIsTrashed === true) {
      return this.createTrashedPayload(profile);
    }

    if (isUnavailableProfile(profile)) return "unavailable";

    const description = profile._sText || profile._sDescription || "";
    const dependencies = parseRequirements(profile._aRequirements);

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
      ...resolveRemoteTimestamps(profile._tsDateAdded, profile._tsDateModified),
      images: [],
      isNSFW: classifyNSFW(profile),
      isObsolete: profile._bIsObsolete ?? false,
      isTrashed: false,
      isMap: false,
      isAudio: true,
      audioUrl: profile._aPreviewMedia._aMetadata._sAudioUrl,
      dependencies,
      metadata: buildMetadata({
        description,
        isMap: false,
        donationMethods: profile._aSubmitter?._aDonationMethods ?? [],
      }),
      modAuthor: buildModAuthor(profile._aSubmitter),
    };
  }

  private async createRegularModPayload(
    mod: GameBananaSubmission,
  ): Promise<GameBananaModPayload | GameBananaProfileSkip> {
    const profile = await this.getMod(
      mod._idRow.toString(),
      "Mod",
      mod._tsDateModified,
    );

    if (!profile) return "not_found";

    assertProfileFresh(profile._tsDateModified, mod._tsDateModified);

    if (profile._bIsTrashed === true) {
      return this.createTrashedPayload(profile);
    }

    if (isUnavailableProfile(profile)) return "unavailable";

    const description = profile._sText || profile._sDescription || "";
    const category = categoryFromGameBananaProfile(profile);
    const isMap = category === MAPS_CATEGORY_NAME;
    const dependencies = parseRequirements(profile._aRequirements);

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
      ...resolveRemoteTimestamps(profile._tsDateAdded, profile._tsDateModified),
      images:
        profile._aPreviewMedia?._aImages?.map(
          (image) => `${image._sBaseUrl}/${image._sFile}`,
        ) ?? [],
      isNSFW: classifyNSFW(profile),
      isObsolete: profile._bIsObsolete ?? false,
      isTrashed: false,
      isMap,
      isAudio: false,
      dependencies,
      metadata: buildMetadata({
        description,
        isMap,
        donationMethods: profile._aSubmitter?._aDonationMethods ?? [],
      }),
      modAuthor: buildModAuthor(profile._aSubmitter),
    };
  }

  private createTrashedPayload(
    profile:
      | GameBanana.GameBananaModProfile
      | GameBanana.GameBananaSoundProfile,
  ): GameBananaModPayload {
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
      ...resolveRemoteTimestamps(profile._tsDateAdded, profile._tsDateModified),
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
    skipped?: GameBananaProfileSkip;
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

      if (typeof payload === "string") {
        wide.set(
          "outcome_reason",
          payload === "not_found" ? "profile_not_found" : "profile_unavailable",
        );
        wide.emit("success");
        return {
          mod: undefined,
          filesChanged: false,
          contentChanged: false,
          skipped: payload,
        };
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
      const { modAuthor, ...modPayload } = payload;
      const author = modAuthor
        ? await modAuthorRepository.upsert(modAuthor)
        : null;
      const { mod: dbMod, contentChanged } =
        await modRepository.upsertByRemoteId({
          ...modPayload,
          modAuthorId: author?.id,
        });
      wide.set("upsertMs", Date.now() - t0);

      t0 = Date.now();
      const { filesChanged } = await this.refreshModDownloads(
        dbMod,
        mod._tsDateModified,
      );
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

  async refreshModDownloads(
    dbMod: Mod,
    indexModifiedAt?: number,
  ): Promise<{ filesChanged: boolean }> {
    try {
      const download = await this.getModDownload(
        dbMod.remoteId,
        dbMod.isAudio ? "Sound" : "Mod",
        indexModifiedAt,
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

      const downloadEntries = download._aFiles.map((file) => {
        const addedAt = gameBananaTimestampToDate(file._tsDateAdded);
        return {
          remoteId: file._idRow.toString(),
          url: file._sDownloadUrl,
          file: file._sFile,
          size: file._nFilesize,
          description: file._sDescription || null,
          modId: dbMod.id,
          md5Checksum: file._sMd5Checksum ?? null,
          createdAt: addedAt,
          updatedAt: addedAt,
        };
      });

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
