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
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.map((tag) =>
    typeof tag === 'string' ? tag : `${tag._sTitle} ${tag._sValue}`
  );
};

// NSFW detection keywords - case insensitive
const NSFW_KEYWORDS = [
  'nsfw',
  'adult',
  '18+',
  'nude',
  'nudity',
  'full nudity',
  'partial nudity',
  'lewd',
  'skimpy',
  'sex',
  'sexual',
  'explicit',
];

// Direct content rating flags from GameBanana
const NSFW_CONTENT_RATINGS = {
  st: 'Sexual Themes',
  sa: 'Skimpy Attire',
  lp: 'Lewd Angles & Poses',
  pn: 'Partial Nudity',
  nu: 'Full Nudity',
};

/**
 * Classify if a GameBanana mod contains NSFW content
 * @param mod GameBanana mod submission data
 * @returns boolean indicating if the mod is NSFW
 */
const classifyNSFW = (
  mod:
    | GameBananaSubmission
    | GameBanana.GameBananaModProfile
    | GameBanana.GameBananaSoundProfile
): boolean => {
  // Check if mod has extended fields (full mod profile)
  const extendedMod = mod as GameBanana.GameBananaModProfile;

  // 1. Direct flags (authoritative) - check _aContentRatings
  if (extendedMod._aContentRatings) {
    for (const key of Object.keys(extendedMod._aContentRatings)) {
      if (NSFW_CONTENT_RATINGS[key as keyof typeof NSFW_CONTENT_RATINGS]) {
        return true; // Any content rating flag = NSFW
      }
    }
  }

  // 2. Secondary hints (soft indicators)
  let hintScore = 0;

  // Check _sInitialVisibility
  if (extendedMod._sInitialVisibility === 'hide') {
    hintScore += 1;
  }

  // Check text content for NSFW keywords
  const hasName = '_sName' in mod;
  const hasTags = '_aTags' in mod;
  const tags = hasTags ? (mod as { _aTags: unknown })._aTags : [];
  const modName = hasName ? (mod as { _sName: string })._sName : '';

  const textContent = [
    modName,
    extendedMod._sDescription || '',
    extendedMod._sText || '',
    ...parseTags(tags as GameBanana.GameBananaSubmission['_aTags']),
  ]
    .join(' ')
    .toLowerCase();

  const foundKeywords = NSFW_KEYWORDS.filter((keyword) =>
    textContent.includes(keyword.toLowerCase())
  );

  if (foundKeywords.length > 0) {
    hintScore += 1;
  }

  // Return true if hint score >= 2 (medium confidence threshold)
  return hintScore >= 2;
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
    this.logger.withMetadata({ page }).debug('Fetching all submissions');
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Mod/Index?_nPerpage=15&_aFilters%5BGeneric_Game%5D=${DEADLOCK_GAME_ID}&_nPage=${page}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaIndexSubmission>;
      this.logger
        .withMetadata({ page, count: data._aRecords.length })
        .debug('Fetched all submissions');
      return data;
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ page })
        .error('Failed to fetch submissions');
      throw error;
    }
  }

  async getAllSoundSubmissions(
    page: number
  ): Promise<
    GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSoundSubmission>
  > {
    this.logger.withMetadata({ page }).debug('Fetching all submissions');
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Sound/Index?_nPerpage=15&_aFilters%5BGeneric_Game%5D=${DEADLOCK_GAME_ID}&_nPage=${page}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSoundSubmission>;
      this.logger
        .withMetadata({ page, count: data._aRecords.length })
        .debug('Fetched all sound submissions');

      return data;
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ page })
        .error('Failed to fetch submissions');
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
      this.logger.withError(error).error('Failed to fetch top submissions');
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
      this.logger
        .withError(error)
        .withMetadata({ page })
        .error('Failed to fetch submissions');
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
          this.logger
            .withMetadata({
              name: submission._sName,
              id: submission._idRow,
              source,
            })
            .info('Synchronized GameBanana mod');
        } else {
          this.logger
            .withMetadata({
              name: submission._sName,
              id: submission._idRow,
              source,
            })
            .warn('Failed to create mod, skipping...');
        }
      }

      const duration = Date.now() - startTime;
      this.logger
        .withMetadata({
          count,
          durationMs: duration,
          modsPerSecond: count / (duration / MILLISECONDS_PER_SECOND),
        })
        .info('Completed GameBanana synchronization');
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({
          processedCount: count,
        })
        .error('Synchronization failed');
      throw error;
    }
  }

  async createModPayload(
    mod: GameBananaSubmission,
    source: GameBananaSubmissionSource
  ): Promise<NewMod> {
    if (source === 'featured') {
      const featuredSubmission = mod as GameBanana.GameBananaSubmission;
      const submission = await this.getMod(
        featuredSubmission._idRow.toString(),
        'Mod'
      );
      return {
        remoteId: featuredSubmission._idRow.toString(),
        name: featuredSubmission._sName,
        description: submission._sText || submission._sDescription || '',
        tags: parseTags(submission._aTags),
        author: featuredSubmission._aSubmitter._sName,
        likes: featuredSubmission._nLikeCount ?? 0,
        hero: guessHero(featuredSubmission._sName),
        downloadCount: submission._nDownloadCount ?? 0,
        remoteUrl: featuredSubmission._sProfileUrl,
        category: featuredSubmission._sModelName,
        downloadable: featuredSubmission._bHasFiles,
        remoteAddedAt: new Date(
          submission._tsDateAdded * MILLISECONDS_PER_SECOND
        ),
        remoteUpdatedAt: new Date(
          submission._tsDateModified * MILLISECONDS_PER_SECOND
        ),
        images: submission._aPreviewMedia._aImages.map(
          (image) => `${image._sBaseUrl}/${image._sFile}`
        ),
        isNSFW: classifyNSFW(submission),
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
        description: submission._sText || submission._sDescription || '',
        tags: parseTags(submission._aTags),
        author: topSubmission._aSubmitter._sName,
        likes: topSubmission._nLikeCount,
        hero: guessHero(topSubmission._sName),
        downloadCount: submission._nDownloadCount,
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
        isNSFW: classifyNSFW(submission),
      };
    }

    if (source === 'all') {
      const submission = await this.getMod(mod._idRow.toString(), 'Mod');
      return {
        remoteId: submission._idRow.toString(),
        name: submission._sName,
        description: submission._sText || submission._sDescription || '',
        tags: parseTags(submission._aTags),
        author: submission._aSubmitter._sName,
        likes: submission._nLikeCount,
        hero: guessHero(submission._sName),
        downloadCount: submission._nDownloadCount,
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
        isNSFW: classifyNSFW(submission),
      };
    }

    if (source === 'sound') {
      const submission = await this.getMod(mod._idRow.toString(), 'Sound');
      return {
        remoteId: submission._idRow.toString(),
        name: submission._sName,
        description: submission._sText || submission._sDescription || '',
        tags: parseTags(submission._aTags),
        author: submission._aSubmitter._sName,
        likes: submission._nLikeCount,
        hero: guessHero(submission._sName),
        downloadCount: submission._nDownloadCount,
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
        isNSFW: classifyNSFW(submission),
      };
    }

    throw new Error(`Invalid source: ${source}`);
  }

  async createMod(
    mod: GameBananaSubmission,
    source: GameBananaSubmissionSource
  ): Promise<Mod | undefined> {
    this.logger
      .withMetadata({
        modId: mod._idRow.toString(),
        source,
      })
      .debug('Creating/updating mod');
    try {
      const payload = await this.createModPayload(mod, source);

      // Upsert mod using repository
      const dbMod = await modRepository.upsertByRemoteId(payload);

      this.logger
        .withMetadata({ modId: dbMod.id })
        .debug('Mod upserted successfully');

      await this.refreshModDownloads(dbMod);

      return dbMod;
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({
          error,
          modId: mod._idRow.toString(),
          source,
        })
        .error('Failed to create/update mod');
    }
  }

  async refreshModDownloads(dbMod: Mod): Promise<void> {
    try {
      const download = await this.getModDownload(
        dbMod.remoteId,
        dbMod.isAudio ? 'Sound' : 'Mod'
      );

      if (!download?._aFiles || download._aFiles.length === 0) {
        this.logger
          .withMetadata({
            modId: dbMod.id,
            remoteId: dbMod.remoteId,
          })
          .warn('No download found for mod');
        return;
      }

      this.logger
        .withMetadata({
          modId: dbMod.id,
          fileCount: download._aFiles.length,
        })
        .debug('Processing mod downloads');

      // Store all downloadable files for the mod
      const downloadEntries = download._aFiles.map((file) => ({
        remoteId: file._idRow.toString(),
        url: file._sDownloadUrl,
        file: file._sFile,
        size: file._nFilesize,
        modId: dbMod.id,
        createdAt: new Date(file._tsDateAdded * MILLISECONDS_PER_SECOND),
        updatedAt: new Date(file._tsDateAdded * MILLISECONDS_PER_SECOND),
      }));

      // Upsert all mod downloads using repository
      await modDownloadRepository.upsertMultipleByModId(
        dbMod.id,
        downloadEntries
      );

      this.logger
        .withMetadata({
          modId: dbMod.id,
          downloadCount: downloadEntries.length,
          files: downloadEntries.map((d) => d.file),
        })
        .debug('Upserted mod downloads');

      this.logger
        .withMetadata({
          modId: dbMod.id,
          downloadCount: downloadEntries.length,
        })
        .info('Refreshed mod downloads successfully');
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({
          error,
          modId: dbMod.id,
          remoteId: dbMod.remoteId,
        })
        .error('Failed to refresh mod downloads');
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

    this.logger
      .withMetadata({
        count: allMods.length,
      })
      .info('Starting refresh of all mod downloads');

    for (const mod of allMods) {
      try {
        await this.refreshModDownloads(mod);
        this.logger
          .withMetadata({
            modId: mod.id,
            name: mod.name,
          })
          .info('Refreshed mod downloads');
      } catch (error) {
        this.logger
          .withError(error)
          .withMetadata({
            error,
            modId: mod.id,
            name: mod.name,
          })
          .error('Failed to refresh mod downloads');
        // Continue with other mods even if one fails
      }
    }

    this.logger
      .withMetadata({
        count: allMods.length,
      })
      .info('Completed refreshing all mod downloads');
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
