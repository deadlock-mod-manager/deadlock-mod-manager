import { Mod, prisma } from '@deadlock-mods/database'
import { guessHero } from '@deadlock-mods/utils'
import { GameBananaPaginatedResponse, GameBananaSubmission } from '../../types/game-banana'
import { Provider, providerRegistry } from './registry'

export const DEADLOCK_GAME_ID = 20948 // {{base_url}}/Util/Game/NameMatch?_sName=Deadlock
export const GAME_BANANA_BASE_URL = 'https://gamebanana.com/apiv11'
export const ACCEPTED_MODELS = ['Mod']

export class GameBananaProvider extends Provider<GameBananaSubmission> {
  async getSubmissions(page: number): Promise<GameBananaPaginatedResponse<GameBananaSubmission>> {
    const response = await fetch(
      `${GAME_BANANA_BASE_URL}/Util/List/Featured?_nPage=${page}&_idGameRow=${DEADLOCK_GAME_ID}`
    )
    const data = (await response.json()) as GameBananaPaginatedResponse<GameBananaSubmission>
    return data
  }

  async *getMods(): AsyncGenerator<GameBananaSubmission> {
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

  async createMod(mod: GameBananaSubmission): Promise<Mod> {
    return await prisma.mod.upsert({
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
        downloads: mod._nViewCount,
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
        downloads: mod._nViewCount,
        images: mod._aPreviewMedia._aImages.map((image) => `${image._sBaseUrl}/${image._sFile}`),
        remoteUpdatedAt: new Date(mod._tsDateModified * 1000)
      }
    })
  }
}

providerRegistry.registerProvider('gamebanana', GameBananaProvider)
