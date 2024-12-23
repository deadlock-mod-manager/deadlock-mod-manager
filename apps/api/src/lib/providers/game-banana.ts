import { Mod, prisma } from '@deadlock-mods/database'
import { GameBanana, guessHero } from '@deadlock-mods/utils'
import { Provider, providerRegistry } from './registry'

export const DEADLOCK_GAME_ID = 20948 // {{base_url}}/Util/Game/NameMatch?_sName=Deadlock
export const GAME_BANANA_BASE_URL = 'https://gamebanana.com/apiv11'
export const ACCEPTED_MODELS = ['Mod']

export class GameBananaProvider extends Provider<GameBanana.GameBananaSubmission> {
  async getSubmissions(page: number): Promise<GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSubmission>> {
    const response = await fetch(
      `${GAME_BANANA_BASE_URL}/Util/List/Featured?_nPage=${page}&_idGameRow=${DEADLOCK_GAME_ID}`
    )
    const data = (await response.json()) as GameBanana.GameBananaPaginatedResponse<GameBanana.GameBananaSubmission>
    return data
  }

  async *getMods(): AsyncGenerator<GameBanana.GameBananaSubmission> {
    let isComplete = false
    let page = 1
    while (!isComplete) {
      const submissions = await this.getSubmissions(page)
      for (const submission of submissions._aRecords) {
        yield submission
      }
      isComplete = submissions._aMetadata._bIsComplete
      page++
    }
  }

  async getMod<D = GameBanana.GameBananaModDownload>(remoteId: string): Promise<D> {
    const response = await fetch(`${GAME_BANANA_BASE_URL}/Mod/${remoteId}/DownloadPage`)
    const data = (await response.json()) as D
    return data
  }

  async synchronize(): Promise<void> {
    const mods = this.getMods()
    let count = 0
    for await (const mod of mods) {
      count++
      await this.createMod(mod)
      this.logger.info('Synchronized GameBanana mod: ' + mod._sName)
    }
    this.logger.info('Synchronized GameBanana mods', { count })
  }

  async createMod(mod: GameBanana.GameBananaSubmission): Promise<Mod> {
    const dbMod = await prisma.mod.upsert({
      where: {
        remoteId: mod._idRow.toString()
      },
      create: {
        remoteId: mod._idRow.toString(),
        name: mod._sName,
        tags: mod._aTags,
        author: mod._aSubmitter._sName,
        likes: mod._nLikeCount,
        hero: guessHero(mod._sName),
        downloadCount: mod._nViewCount,
        remoteUrl: mod._sProfileUrl,
        category: mod._sModelName,
        downloadable: mod._bHasFiles,
        remoteAddedAt: new Date(mod._tsDateAdded * 1000),
        remoteUpdatedAt: new Date(mod._tsDateModified * 1000),
        images: mod._aPreviewMedia._aImages.map((image) => `${image._sBaseUrl}/${image._sFile}`)
      },
      update: {
        name: mod._sName,
        tags: mod._aTags,
        hero: guessHero(mod._sName),
        author: mod._aSubmitter._sName,
        likes: mod._nLikeCount,
        downloadCount: mod._nViewCount,
        images: mod._aPreviewMedia._aImages.map((image) => `${image._sBaseUrl}/${image._sFile}`),
        remoteUpdatedAt: new Date(mod._tsDateModified * 1000)
      }
    })

    const download = await this.getMod(dbMod.remoteId)

    if (!download || !download._aFiles) {
      this.logger.warn('No download found for mod: ' + dbMod.remoteId)
      return dbMod
    }

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
      this.logger.info('-> Synchronized GameBanana mod download: ' + file._sFile)
    }

    return dbMod
  }
}

providerRegistry.registerProvider('gamebanana', GameBananaProvider)
