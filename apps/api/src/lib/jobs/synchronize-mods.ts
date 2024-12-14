import { Cron } from 'croner'
import { registerJob } from '.'
import { GameBananaSubmission } from '../../types/game-banana'
import Logger from '../logger'
import { providerRegistry } from '../providers'

const logger = Logger.getSubLogger({
  name: 'synchronize-mods'
})

const job = new Cron(
  '0 */30 * * * *',
  {
    paused: true
  },
  async () => {
    logger.info('Synchronizing mods at ' + new Date().toISOString())
    const provider = providerRegistry.getProvider<GameBananaSubmission>('gamebanana')
    await provider.synchronize()
  }
)

registerJob(job)
