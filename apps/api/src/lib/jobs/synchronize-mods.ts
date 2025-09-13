import * as Sentry from '@sentry/node';
import { Cron } from 'croner';
import { MONITOR_SLUG } from '../constants';
import { logger as mainLogger } from '../logger';
import { ModSyncService } from '../services/mod-sync';
import { registerJob } from '.';

const logger = mainLogger.child().withContext({
  job: 'synchronize-mods',
});

const job = new Cron(
  '0 0 * * * *',
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
          value: '0 0 * * * *',
        },
        checkinMargin: 1,
        maxRuntime: 10,
        timezone: 'Europe/Paris',
      }
    );

    logger.info(
      `Starting scheduled mod synchronization at ${new Date().toISOString()}`
    );

    const syncService = ModSyncService.getInstance();
    const result = await syncService.synchronizeMods({
      checkInId,
      monitorSlug: MONITOR_SLUG,
    });

    if (result.success) {
      logger.info('Scheduled mod synchronization completed successfully');
    } else {
      logger.warn(`Scheduled mod synchronization result: ${result.message}`);
    }
  }
);

registerJob(job);
