import { GameBanana } from '@deadlock-mods/utils'
import * as Sentry from '@sentry/node'
import { Cron } from 'croner'
import { registerJob } from '.'
import Logger from '../logger'
import { providerRegistry } from '../providers'

const logger = Logger.getSubLogger({
  name: 'synchronize-mods'
})
const MONITOR_SLUG = 'mods-synchronization'

const job = new Cron(
  '0 0 * * * *',
  {
    paused: true
  },
  async () => {
    const checkInId = Sentry.captureCheckIn(
      {
        monitorSlug: MONITOR_SLUG,
        status: 'in_progress'
      },
      {
        schedule: {
          type: 'crontab',
          value: '0 * * * *'
        },
        checkinMargin: 1,
        maxRuntime: 10,
        timezone: 'Europe/Paris'
      }
    )
    try {
      logger.info('Synchronizing mods at ' + new Date().toISOString())
      const provider = providerRegistry.getProvider<GameBanana.GameBananaSubmission>('gamebanana')
      await provider.synchronize()
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: MONITOR_SLUG,
        status: 'ok'
      })
    } catch (error) {
      Sentry.captureException(error)
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: MONITOR_SLUG,
        status: 'error'
      })
    }
  }
)

registerJob(job)
