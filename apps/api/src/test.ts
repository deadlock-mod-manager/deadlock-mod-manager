import { GameBanana } from '@deadlock-mods/utils'
import Logger from './lib/logger'
import { providerRegistry } from './lib/providers'

const logger = Logger.getSubLogger({
  name: 'test'
})

async function main() {
  logger.info('Synchronizing mods at ' + new Date().toISOString())
  const provider = providerRegistry.getProvider<GameBanana.GameBananaSubmission>('gamebanana')
  await provider.synchronize()
}

main()
