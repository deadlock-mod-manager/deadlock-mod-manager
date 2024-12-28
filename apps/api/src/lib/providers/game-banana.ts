import { Mod, Prisma, prisma } from '@deadlock-mods/database'
import { GameBanana, guessHero } from '@deadlock-mods/utils'
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

  async createModPayload(
    mod: GameBananaSubmission,
    source: GameBananaSubmissionSource
  ): Promise<Prisma.ModUpsertArgs['create']> {
    switch (source) {
      case 'featured': {
        const submission = mod as GameBanana.GameBananaSubmission
        return {
          remoteId: submission._idRow.toString(),
          name: submission._sName,
          tags: parseTags(submission._aTags),
          author: submission._aSubmitter._sName,
          likes: submission._nLikeCount,
          hero: guessHero(submission._sName),
          downloadCount: submission._nViewCount,
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
      const dbMod = await prisma.mod.upsert({
        where: {
          remoteId: mod._idRow.toString()
        },
        create: payload,
        update: {
          name: payload.name,
          tags: payload.tags,
          hero: payload.hero,
          author: payload.author,
          likes: payload.likes,
          downloadCount: payload.downloadCount,
          images: payload.images,
          remoteUpdatedAt: payload.remoteUpdatedAt
        }
      })
      this.logger.debug('Mod upserted successfully', { modId: dbMod.id })

      const download = await this.getModDownload(dbMod.remoteId)

      if (!download || !download._aFiles) {
        this.logger.warn('No download found for mod', { modId: dbMod.id, remoteId: dbMod.remoteId })
        return dbMod
      }

      this.logger.debug('Processing mod downloads', { modId: dbMod.id, fileCount: download._aFiles.length })
      for (const file of download._aFiles) {
        await prisma.modDownload.upsert({
          where: {
            modId_remoteId: {
              modId: dbMod.id,
              remoteId: file._idRow.toString()
            }
          },
          create: {
            remoteId: file._idRow.toString(),
            url: file._sDownloadUrl,
            file: file._sFile,
            size: file._nFilesize,
            modId: dbMod.id
          },
          update: {}
        })
        this.logger.debug('Synchronized mod download', {
          modId: dbMod.id,
          fileName: file._sFile,
          fileSize: file._nFilesize
        })
      }

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
}

providerRegistry.registerProvider('gamebanana', GameBananaProvider)
