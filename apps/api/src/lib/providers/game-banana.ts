import {
  type Mod,
  modDownloadRepository,
  modRepository,
  type NewMod,
} from '@deadlock-mods/database';
import { type GameBanana, guessHero } from '@deadlock-mods/utils';
import { Provider, providerRegistry } from './registry';

export const DEADLOCK_GAME_ID = 20_948; // {{base_url}}/Util/Game/NameMatch?_sName=Deadlock
export const GAME_BANANA_BASE_URL = 'https://gamebanana.com/apiv11';
export const ACCEPTED_MODELS = ['Mod', 'Sound'];
const MILLISECONDS_PER_SECOND = 1000;

const parseTags = (
  tags: GameBanana.GameBananaSubmission['_aTags']
): string[] => {
  return tags.map((tag) =>
    typeof tag === 'string' ? tag : `${tag._sTitle} ${tag._sValue}`
  );
};

export type GameBananaSubmissionSource = 'featured' | 'top' | 'all' | 'sound';
export type GameBananaSubmission =
  | GameBanana.GameBananaSubmission
  | GameBanana.GameBananaTopSubmission
  | GameBanana.GameBananaIndexSubmission
  | GameBanana.GameBananaSoundSubmission;

export class GameBananaProvider extends Provider<GameBananaSubmission> {
  async getAllSubmissions(
    page: number
  ): Promise<
    GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaIndexSubmission>
  > {
    this.logger.debug('Fetching all submissions', { page });
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Mod/Index?_nPerpage=15&_aFilters%5BGeneric_Game%5D=${DEADLOCK_GAME_ID}&_nPage=${page}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaIndexSubmission>;
      this.logger.debug('Fetched all submissions', {
        page,
        count: data._aRecords.length,
      });
      return data;
    } catch (error) {
      this.logger.error('Failed to fetch submissions', { error, page });
      throw error;
    }
  }

  async getAllSoundSubmissions(
    page: number
  ): Promise<
    GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSoundSubmission>
  > {
    this.logger.debug('Fetching all submissions', { page });
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Sound/Index?_nPerpage=15&_aFilters%5BGeneric_Game%5D=${DEADLOCK_GAME_ID}&_nPage=${page}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSoundSubmission>;
      this.logger.debug('Fetched all sound submissions', {
        page,
        count: data._aRecords.length,
      });
      return data;
    } catch (error) {
      this.logger.error('Failed to fetch submissions', { error, page });
      throw error;
    }
  }

  async getTopSubmissions(): Promise<GameBanana.GameBananaTopSubmission[]> {
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Game/${DEADLOCK_GAME_ID}/TopSubs`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaTopSubmission[];
      return data;
    } catch (error) {
      this.logger.error('Failed to fetch top submissions', { error });
      throw error;
    }
  }

  async getSubmissions(
    page: number
  ): Promise<
    GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSubmission>
  > {
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Util/List/Featured?_nPage=${page}&_idGameRow=${DEADLOCK_GAME_ID}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSubmission>;
      return data;
    } catch (error) {
      this.logger.error('Failed to fetch submissions', { error, page });
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
        yield { submission, source: 'featured' };
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
      yield { submission, source: 'top' };
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
        yield { submission, source: 'all' };
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
        yield { submission, source: 'sound' };
      }
      isComplete = submissions._aMetadata._bIsComplete;
      page++;
    }
  }

  async *getMods(): AsyncGenerator<{
    submission: GameBananaSubmission;
    source: GameBananaSubmissionSource;
  }> {
    yield* this.getSoundSubmissions();
    yield* this.getAllMods();
    yield* this.getFeaturedMods(); // These two are most likely redundant, but I haven't checked
    yield* this.getTopMods(); // These two are most likely redundant, but I haven't checked
  }

  async getModDownload<D = GameBanana.GameBananaModDownload>(
    remoteId: string,
    modType: 'Mod' | 'Sound' = 'Mod'
  ): Promise<D> {
    const response = await fetch(
      `${GAME_BANANA_BASE_URL}/${modType}/${remoteId}/DownloadPage`
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
    T extends 'Mod' | 'Sound' = 'Mod',
    D = T extends 'Mod'
      ? GameBanana.GameBananaModProfile
      : GameBanana.GameBananaSoundProfile,
  >(remoteId: string, modType: T): Promise<D> {
    const response = await fetch(
      `${GAME_BANANA_BASE_URL}/${modType}/${remoteId}/ProfilePage`
    );
    const data = (await response.json()) as D;
    return data;
  }

  async synchronize(): Promise<void> {
    this.logger.info('Starting GameBanana synchronization');
    const mods = this.getMods();
    let count = 0;
    const startTime = Date.now();

    try {
      for await (const { submission, source } of mods) {
        count++;
        const mod = await this.createMod(submission, source);
        if (mod) {
          this.logger.info('Synchronized GameBanana mod', {
            name: submission._sName,
            id: submission._idRow,
            source,
          });
        } else {
          this.logger.warn('Failed to create mod, skipping...', {
            name: submission._sName,
            id: submission._idRow,
            source,
          });
        }
      }

      const duration = Date.now() - startTime;
      this.logger.info('Completed GameBanana synchronization', {
        count,
        durationMs: duration,
        modsPerSecond: count / (duration / MILLISECONDS_PER_SECOND),
      });
    } catch (error) {
      this.logger.error('Synchronization failed', {
        error,
        processedCount: count,
      });
      throw error;
    }
  }

  async createModPayload(
    mod: GameBananaSubmission,
    source: GameBananaSubmissionSource
  ): Promise<NewMod> {
    if (source === 'featured') {
      const submission = mod as GameBanana.GameBananaSubmission;
      return {
        remoteId: submission._idRow.toString(),
        name: submission._sName,
        tags: parseTags(submission._aTags),
        author: submission._aSubmitter._sName,
        likes: submission._nLikeCount ?? 0,
        hero: guessHero(submission._sName),
        downloadCount: submission._nViewCount ?? 0,
        remoteUrl: submission._sProfileUrl,
        category: submission._sModelName,
        downloadable: submission._bHasFiles,
        remoteAddedAt: new Date(
          submission._tsDateAdded * MILLISECONDS_PER_SECOND
        ),
        remoteUpdatedAt: new Date(
          submission._tsDateModified * MILLISECONDS_PER_SECOND
        ),
        images: submission._aPreviewMedia._aImages.map(
          (image) => `${image._sBaseUrl}/${image._sFile}`
        ),
      };
    }

    if (source === 'top') {
      const topSubmission = mod as GameBanana.GameBananaTopSubmission;
      const submission = await this.getMod(
        topSubmission._idRow.toString(),
        'Mod'
      );
      return {
        remoteId: topSubmission._idRow.toString(),
        name: topSubmission._sName,
        tags: parseTags(submission._aTags),
        author: topSubmission._aSubmitter._sName,
        likes: topSubmission._nLikeCount,
        hero: guessHero(topSubmission._sName),
        downloadCount: submission._nViewCount,
        remoteUrl: topSubmission._sProfileUrl,
        category: topSubmission._sModelName,
        downloadable: (submission?._aFiles?.length ?? 0) > 0,
        remoteAddedAt: new Date(
          submission._tsDateAdded * MILLISECONDS_PER_SECOND
        ),
        remoteUpdatedAt: new Date(
          submission._tsDateModified * MILLISECONDS_PER_SECOND
        ),
        images: submission._aPreviewMedia._aImages.map(
          (image) => `${image._sBaseUrl}/${image._sFile}`
        ),
      };
    }

    if (source === 'all') {
      const submission = await this.getMod(mod._idRow.toString(), 'Mod');
      return {
        remoteId: submission._idRow.toString(),
        name: submission._sName,
        tags: parseTags(submission._aTags),
        author: submission._aSubmitter._sName,
        likes: submission._nLikeCount,
        hero: guessHero(submission._sName),
        downloadCount: submission._nViewCount,
        remoteUrl: submission._sProfileUrl,
        category: submission._aCategory._sName,
        downloadable: (submission?._aFiles?.length ?? 0) > 0,
        remoteAddedAt: new Date(
          submission._tsDateAdded * MILLISECONDS_PER_SECOND
        ),
        remoteUpdatedAt: new Date(
          submission._tsDateModified * MILLISECONDS_PER_SECOND
        ),
        images: submission._aPreviewMedia._aImages.map(
          (image) => `${image._sBaseUrl}/${image._sFile}`
        ),
      };
    }

    if (source === 'sound') {
      const submission = await this.getMod(mod._idRow.toString(), 'Sound');
      return {
        remoteId: submission._idRow.toString(),
        name: submission._sName,
        tags: parseTags(submission._aTags),
        author: submission._aSubmitter._sName,
        likes: submission._nLikeCount,
        hero: guessHero(submission._sName),
        downloadCount: submission._nViewCount,
        remoteUrl: submission._sProfileUrl,
        category: submission._aCategory._sName,
        downloadable: (submission?._aFiles?.length ?? 0) > 0,
        remoteAddedAt: new Date(
          submission._tsDateAdded * MILLISECONDS_PER_SECOND
        ),
        remoteUpdatedAt: new Date(
          submission._tsDateModified * MILLISECONDS_PER_SECOND
        ),
        images: [],
        isAudio: true,
        audioUrl: submission._aPreviewMedia._aMetadata._sAudioUrl,
      };
    }

    throw new Error(`Invalid source: ${source}`);
  }

  async createMod(
    mod: GameBananaSubmission,
    source: GameBananaSubmissionSource
  ): Promise<Mod | undefined> {
    this.logger.debug('Creating/updating mod', {
      modId: mod._idRow.toString(),
      source,
    });
    try {
      const payload = await this.createModPayload(mod, source);

      // Upsert mod using repository
      const dbMod = await modRepository.upsertByRemoteId(payload);

      this.logger.debug('Mod upserted successfully', { modId: dbMod.id });

      await this.refreshModDownloads(dbMod);

      return dbMod;
    } catch (error) {
      this.logger.error('Failed to create/update mod', {
        error,
        modId: mod._idRow.toString(),
        source,
      });
    }
  }

  async refreshModDownloads(dbMod: Mod): Promise<void> {
    try {
      const download = await this.getModDownload(
        dbMod.remoteId,
        dbMod.isAudio ? 'Sound' : 'Mod'
      );

      if (!download?._aFiles || download._aFiles.length === 0) {
        this.logger.warn('No download found for mod', {
          modId: dbMod.id,
          remoteId: dbMod.remoteId,
        });
        return;
      }

      this.logger.debug('Processing mod downloads', {
        modId: dbMod.id,
        fileCount: download._aFiles.length,
      });

      // Since a mod can only have one download, we need to select the most appropriate file
      // We'll prioritize by size (largest first) as it's likely the main mod file
      const sortedFiles = [...download._aFiles].sort(
        (a, b) => b._nFilesize - a._nFilesize
      );
      const primaryFile = sortedFiles[0];

      // Upsert mod download using repository
      await modDownloadRepository.upsertByModId(dbMod.id, {
        remoteId: primaryFile._idRow.toString(),
        url: primaryFile._sDownloadUrl,
        file: primaryFile._sFile,
        size: primaryFile._nFilesize,
        modId: dbMod.id,
      });

      this.logger.debug('Upserted mod download', {
        modId: dbMod.id,
        fileName: primaryFile._sFile,
        fileSize: primaryFile._nFilesize,
      });

      this.logger.info('Refreshed mod download successfully', {
        modId: dbMod.id,
        fileName: primaryFile._sFile,
      });
    } catch (error) {
      this.logger.error('Failed to refresh mod downloads', {
        error,
        modId: dbMod.id,
        remoteId: dbMod.remoteId,
      });
      throw error;
    }
  }

  // Public method to get a mod by ID
  async getModById(modId: string): Promise<Mod | null> {
    return await modRepository.findById(modId);
  }

  // Public method to refresh all mods' downloads
  async refreshAllModDownloads(): Promise<void> {
    const allMods = await modRepository.findAll();

    this.logger.info('Starting refresh of all mod downloads', {
      count: allMods.length,
    });

    for (const mod of allMods) {
      try {
        await this.refreshModDownloads(mod);
        this.logger.info('Refreshed mod downloads', {
          modId: mod.id,
          name: mod.name,
        });
      } catch (error) {
        this.logger.error('Failed to refresh mod downloads', {
          error,
          modId: mod.id,
          name: mod.name,
        });
        // Continue with other mods even if one fails
      }
    }

    this.logger.info('Completed refreshing all mod downloads', {
      count: allMods.length,
    });
  }
}

providerRegistry.registerProvider('gamebanana', GameBananaProvider);

// Add a public method to refresh downloads for mods
export async function refreshModDownloads(modId?: string): Promise<void> {
  const provider = providerRegistry.getProvider(
    'gamebanana'
  ) as GameBananaProvider;

  if (modId) {
    // Refresh a specific mod's downloads
    const mod = await provider.getModById(modId);

    if (!mod) {
      throw new Error(`Mod with ID ${modId} not found`);
    }

    await provider.refreshModDownloads(mod);
  } else {
    // Refresh all mods' downloads
    await provider.refreshAllModDownloads();
  }
}
