import { db } from '@deadlock-mods/database';
import type { GameBanana } from '@deadlock-mods/utils';
import * as Sentry from '@sentry/node';
import { Cron } from 'croner';
import { MONITOR_SLUG } from '../constants';
import { logger as mainLogger } from '../logger';
import { providerRegistry } from '../providers';
import {
  type AcquiredLock,
  DistributedLockService,
} from '../services/distributed-lock';
import { registerJob } from '.';

const logger = mainLogger.child().withContext({
  job: 'synchronize-mods',
});

const lockService = new DistributedLockService(db);
const JOB_NAME = 'synchronize-mods';

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

    let lock: AcquiredLock | null = null;
    try {
      // Try to acquire the lock for this job
      logger.info('Attempting to acquire lock for synchronize-mods job');
      lock = await lockService.acquireLock(JOB_NAME, {
        timeout: 10 * 60 * 1000, // 10 minutes (should be enough for sync job)
        heartbeatInterval: 30 * 1000, // 30 seconds heartbeat
      });

      if (!lock) {
        logger.info(
          'Could not acquire lock, another pod is already running the synchronize-mods job'
        );
        // Cancel the Sentry check-in since we're not actually running
        Sentry.captureCheckIn({
          checkInId,
          monitorSlug: MONITOR_SLUG,
          status: 'ok', // It's ok that we didn't run, another pod did
        });
        return;
      }

      logger.info(
        `Lock acquired by pod: ${lock.instanceId}, starting mod synchronization`
      );
      logger.info(`Synchronizing mods at ${new Date().toISOString()}`);

      const provider =
        providerRegistry.getProvider<GameBanana.GameBananaSubmission>(
          'gamebanana'
        );
      await provider.synchronize();

      logger.info('Mod synchronization completed successfully');

      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: MONITOR_SLUG,
        status: 'ok',
      });
    } catch (error) {
      logger.withError(error).error('Error during mod synchronization');
      Sentry.captureException(error);
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: MONITOR_SLUG,
        status: 'error',
      });
    } finally {
      // Always release the lock if we acquired it
      if (lock) {
        try {
          await lock.release();
          logger.info('Lock released successfully');
        } catch (releaseError) {
          logger.withError(releaseError).error('Error releasing lock');
          // Don't re-throw this error, the main job is done
        }
      }
    }
  }
);

registerJob(job);
