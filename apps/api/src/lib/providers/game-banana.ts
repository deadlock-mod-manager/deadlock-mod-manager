import { Mod, NewMod, db, modDownloads, mods } from '@deadlock-mods/database'
import { GameBanana, guessHero } from '@deadlock-mods/utils'
import { eq } from 'drizzle-orm'
import { Provider, providerRegistry } from './registry'

export const DEADLOCK_GAME_ID = 20948 // {{base_url}}/Util/Game/NameMatch?_sName=Deadlock
export const GAME_BANANA_BASE_URL = 'https://gamebanana.com/apiv11'
export const ACCEPTED_MODELS = ['Mod']

const parseTags = (tags: GameBanana.GameBananaSubmission['_aTags']): string[] => {
  return tags.map((tag) => (typeof tag === 'string' ? tag : `${tag._sTitle} ${tag._sValue}`))
}

export type GameBananaSubmissionSource = 'featured' | 'top' | 'all'
export type GameBananaSubmission =
  | GameBanana.GameBananaSubmission
  | GameBanana.GameBananaTopSubmission
  | GameBanana.GameBananaIndexSubmission

export class GameBananaProvider extends Provider<GameBananaSubmission> {
  async getAllSubmissions(
    page: number
  ): Promise<GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaIndexSubmission>> {
    this.logger.debug('Fetching all submissions', { page })
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Mod/Index?_nPerpage=15&_aFilters%5BGeneric_Game%5D=${DEADLOCK_GAME_ID}&_nPage=${page}`
      )
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data =
        (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaIndexSubmission>
      this.logger.debug('Fetched all submissions', { page, count: data._aRecords.length })
      return data
    } catch (error) {
      this.logger.error('Failed to fetch submissions', { error, page })
      throw error
    }
  }

  async getTopSubmissions(): Promise<GameBanana.GameBananaTopSubmission[]> {
    try {
      const response = await fetch(`${GAME_BANANA_BASE_URL}/Game/${DEADLOCK_GAME_ID}/TopSubs`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = (await response.json()) as GameBanana.GameBananaTopSubmission[]
      return data
    } catch (error) {
      this.logger.error('Failed to fetch top submissions', { error })
      throw error
    }
  }

  async getSubmissions(page: number): Promise<GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSubmission>> {
    try {
      const response = await fetch(
        `${GAME_BANANA_BASE_URL}/Util/List/Featured?_nPage=${page}&_idGameRow=${DEADLOCK_GAME_ID}`
      )
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSubmission>
      return data
    } catch (error) {
      this.logger.error('Failed to fetch submissions', { error, page })
      throw error
    }
  }

  async *getFeaturedMods(): AsyncGenerator<{
    submission: GameBananaSubmission
    source: GameBananaSubmissionSource
  }> {
    let isComplete = false
    let page = 1

    while (!isComplete) {
      const submissions = await this.getSubmissions(page)
      for (const submission of submissions._aRecords) {
        yield { submission, source: 'featured' }
      }
      isComplete = submissions._aMetadata._bIsComplete
      page++
    }
  }

  async *getTopMods(): AsyncGenerator<{
    submission: GameBananaSubmission
    source: GameBananaSubmissionSource
  }> {
    const submissions = await this.getTopSubmissions()
    for (const submission of submissions) {
      yield { submission, source: 'top' }
    }
  }

  async *getAllMods(): AsyncGenerator<{
    submission: GameBananaSubmission
    source: GameBananaSubmissionSource
  }> {
    let isComplete = false
    let page = 1

    while (!isComplete) {
      const submissions = await this.getAllSubmissions(page)
      for (const submission of submissions._aRecords) {
        yield { submission, source: 'all' }
      }
      isComplete = submissions._aMetadata._bIsComplete
      page++
    }
  }

  async *getMods(): AsyncGenerator<{
    submission: GameBananaSubmission
    source: GameBananaSubmissionSource
  }> {
    yield* this.getAllMods()
    yield* this.getFeaturedMods() // These two are most likely redundant, but I haven't checked
    yield* this.getTopMods() // These two are most likely redundant, but I haven't checked
  }

  async getModDownload<D = GameBanana.GameBananaModDownload>(remoteId: string): Promise<D> {
    const response = await fetch(`${GAME_BANANA_BASE_URL}/Mod/${remoteId}/DownloadPage`)
    const data = (await response.json()) as D
    return data
  }

  async getMod<D = GameBanana.GameBananaModProfile>(remoteId: string): Promise<D> {
    const response = await fetch(`${GAME_BANANA_BASE_URL}/Mod/${remoteId}/ProfilePage`)
    const data = (await response.json()) as D
    return data
  }

  async synchronize(): Promise<void> {
    this.logger.info('Starting GameBanana synchronization')
    const mods = this.getMods()
    let count = 0
    const startTime = Date.now()

    try {
      for await (const { submission, source } of mods) {
        count++
        await this.createMod(submission, source)
        this.logger.info('Synchronized GameBanana mod', {
          name: submission._sName,
          id: submission._idRow,
          source
        })
      }

      const duration = Date.now() - startTime
      this.logger.info('Completed GameBanana synchronization', {
        count,
        durationMs: duration,
        modsPerSecond: count / (duration / 1000)
      })
    } catch (error) {
      this.logger.error('Synchronization failed', { error, processedCount: count })
      throw error
    }
  }

  async createModPayload(mod: GameBananaSubmission, source: GameBananaSubmissionSource): Promise<NewMod> {
    switch (source) {
      case 'featured': {
        const submission = mod as GameBanana.GameBananaSubmission
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
          remoteAddedAt: new Date(submission._tsDateAdded * 1000),
          remoteUpdatedAt: new Date(submission._tsDateModified * 1000),
          images: submission._aPreviewMedia._aImages.map((image) => `${image._sBaseUrl}/${image._sFile}`)
        }
      }
      case 'top': {
        const topSubmission = mod as GameBanana.GameBananaTopSubmission
        const submission = await this.getMod(topSubmission._idRow.toString())
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
          downloadable: submission._aFiles.length > 0,
          remoteAddedAt: new Date(submission._tsDateAdded * 1000),
          remoteUpdatedAt: new Date(submission._tsDateModified * 1000),
          images: submission._aPreviewMedia._aImages.map((image) => `${image._sBaseUrl}/${image._sFile}`)
        }
      }
      case 'all': {
        const submission = await this.getMod(mod._idRow.toString())
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
          downloadable: submission._aFiles.length > 0,
          remoteAddedAt: new Date(submission._tsDateAdded * 1000),
          remoteUpdatedAt: new Date(submission._tsDateModified * 1000),
          images: submission._aPreviewMedia._aImages.map((image) => `${image._sBaseUrl}/${image._sFile}`)
        }
      }
    }
  }

  async createMod(mod: GameBananaSubmission, source: GameBananaSubmissionSource): Promise<Mod> {
    this.logger.debug('Creating/updating mod', { modId: mod._idRow.toString(), source })
    try {
      const payload = await this.createModPayload(mod, source)

      // Check if mod exists
      const existingMod = await db.select().from(mods).where(eq(mods.remoteId, mod._idRow.toString())).limit(1)

      let dbMod: Mod

      if (existingMod.length === 0) {
        // Create new mod
        const result = await db.insert(mods).values(payload).returning()
        dbMod = result[0]
      } else {
        // Update existing mod
        const result = await db
          .update(mods)
          .set({
            name: payload.name,
            tags: payload.tags,
            hero: payload.hero,
            author: payload.author,
            likes: payload.likes,
            downloadCount: payload.downloadCount,
            remoteUrl: payload.remoteUrl,
            category: payload.category,
            downloadable: payload.downloadable,
            images: payload.images,
            remoteUpdatedAt: payload.remoteUpdatedAt
          })
          .where(eq(mods.remoteId, mod._idRow.toString()))
          .returning()

        dbMod = result[0]
      }

      this.logger.debug('Mod upserted successfully', { modId: dbMod.id })

      await this.refreshModDownloads(dbMod)

      return dbMod
    } catch (error) {
      this.logger.error('Failed to create/update mod', {
        error,
        modId: mod._idRow.toString(),
        source
      })
      throw error
    }
  }

  async refreshModDownloads(dbMod: Mod): Promise<void> {
    try {
      const download = await this.getModDownload(dbMod.remoteId)

      if (!download || !download._aFiles || download._aFiles.length === 0) {
        this.logger.warn('No download found for mod', { modId: dbMod.id, remoteId: dbMod.remoteId })
        return
      }

      this.logger.debug('Processing mod downloads', { modId: dbMod.id, fileCount: download._aFiles.length })

      // Since a mod can only have one download, we need to select the most appropriate file
      // We'll prioritize by size (largest first) as it's likely the main mod file
      const sortedFiles = [...download._aFiles].sort((a, b) => b._nFilesize - a._nFilesize)
      const primaryFile = sortedFiles[0]

      // Check if a download already exists for this mod
      const existingDownloads = await db.select().from(modDownloads).where(eq(modDownloads.modId, dbMod.id))

      if (existingDownloads.length > 0) {
        const existingDownload = existingDownloads[0]

        // Only update if something changed
        if (
          existingDownload.remoteId !== primaryFile._idRow.toString() ||
          existingDownload.url !== primaryFile._sDownloadUrl ||
          existingDownload.file !== primaryFile._sFile ||
          existingDownload.size !== primaryFile._nFilesize
        ) {
          await db
            .update(modDownloads)
            .set({
              remoteId: primaryFile._idRow.toString(),
              url: primaryFile._sDownloadUrl,
              file: primaryFile._sFile,
              size: primaryFile._nFilesize
            })
            .where(eq(modDownloads.modId, dbMod.id))

          this.logger.debug('Updated mod download', {
            modId: dbMod.id,
            fileName: primaryFile._sFile,
            fileSize: primaryFile._nFilesize
          })
        } else {
          this.logger.debug('Mod download is already up to date', {
            modId: dbMod.id,
            fileName: primaryFile._sFile
          })
        }
      } else {
        // Create new download
        await db.insert(modDownloads).values({
          remoteId: primaryFile._idRow.toString(),
          url: primaryFile._sDownloadUrl,
          file: primaryFile._sFile,
          size: primaryFile._nFilesize,
          modId: dbMod.id
        })

        this.logger.debug('Added mod download', {
          modId: dbMod.id,
          fileName: primaryFile._sFile,
          fileSize: primaryFile._nFilesize
        })
      }

      this.logger.info('Refreshed mod download successfully', {
        modId: dbMod.id,
        fileName: primaryFile._sFile
      })
    } catch (error) {
      this.logger.error('Failed to refresh mod downloads', {
        error,
        modId: dbMod.id,
        remoteId: dbMod.remoteId
      })
      throw error
    }
  }

  // Public method to get a mod by ID
  async getModById(modId: string): Promise<Mod | null> {
    const modRecord = await db.select().from(mods).where(eq(mods.id, modId)).limit(1)
    return modRecord.length > 0 ? modRecord[0] : null
  }

  // Public method to refresh all mods' downloads
  async refreshAllModDownloads(): Promise<void> {
    const allMods = await db.select().from(mods)

    this.logger.info('Starting refresh of all mod downloads', { count: allMods.length })

    for (const mod of allMods) {
      try {
        await this.refreshModDownloads(mod)
        this.logger.info('Refreshed mod downloads', { modId: mod.id, name: mod.name })
      } catch (error) {
        this.logger.error('Failed to refresh mod downloads', { error, modId: mod.id, name: mod.name })
        // Continue with other mods even if one fails
      }
    }

    this.logger.info('Completed refreshing all mod downloads', { count: allMods.length })
  }
}

providerRegistry.registerProvider('gamebanana', GameBananaProvider)

// Add a public method to refresh downloads for mods
export async function refreshModDownloads(modId?: string): Promise<void> {
  const provider = providerRegistry.getProvider('gamebanana') as GameBananaProvider

  if (modId) {
    // Refresh a specific mod's downloads
    const mod = await provider.getModById(modId)

    if (!mod) {
      throw new Error(`Mod with ID ${modId} not found`)
    }

    await provider.refreshModDownloads(mod)
  } else {
    // Refresh all mods' downloads
    await provider.refreshAllModDownloads()
  }
}
