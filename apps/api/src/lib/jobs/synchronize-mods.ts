import type { GameBanana } from '@deadlock-mods/utils';
import * as Sentry from '@sentry/node';
import { Cron } from 'croner';
import { MONITOR_SLUG } from '../constants';
import { logger as mainLogger } from '../logger';
import { providerRegistry } from '../providers';
import { registerJob } from '.';

const logger = mainLogger.child().withContext({
  job: 'synchronize-mods',
});

const job = new Cron(
  '0 0 0 * * *',
  {
    paused: true,
  },
  async () => {
    const checkInId = Sentry.captureCheckIn(
      {
        monitorSlug: MONITOR_SLUG,
        status: 'in_progress',
      },
      {
        schedule: {
          type: 'crontab',
          value: '0 0 0 * * *',
        },
        checkinMargin: 1,
        maxRuntime: 10,
        timezone: 'Europe/Paris',
      }
    );
    try {
      logger.info(`Synchronizing mods at ${new Date().toISOString()}`);
      const provider =
        providerRegistry.getProvider<GameBanana.GameBananaSubmission>(
          'gamebanana'
        );
      await provider.synchronize();
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: MONITOR_SLUG,
        status: 'ok',
      });
    } catch (error) {
      Sentry.captureException(error);
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: MONITOR_SLUG,
        status: 'error',
      });
    }
  }
);

registerJob(job);
