import Logger from './lib/logger'
import { providerRegistry } from './lib/providers'
import { GameBananaSubmission } from './types/game-banana'

const logger = Logger.getSubLogger({
  name: 'test'
})

async function main() {
  logger.info('Synchronizing mods at ' + new Date().toISOString())
  const provider = providerRegistry.getProvider<GameBananaSubmission>('gamebanana')
  await provider.synchronize()
}

main()
