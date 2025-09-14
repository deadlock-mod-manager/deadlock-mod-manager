import { CronPatterns } from './lib/cron';
import { logger } from './lib/logger';
import { ModProcessor } from './processors/mod-processor';
import { ModsSchedulerProcessor } from './processors/mods-scheduler';
import { CronService } from './services/cron';
import { queueService } from './services/queue';
import { ModsWorker } from './workers/mods-worker';

const main = async () => {
  const cronService = new CronService();

  const modsProcessor = new ModProcessor();
  const modsScheduler = new ModsSchedulerProcessor();

  const modsWorker = new ModsWorker(modsProcessor, 1);

  await cronService.defineJob({
    name: 'mods-scheduler',
    pattern: CronPatterns.EVERY_6_HOURS,
    processor: modsScheduler,
    enabled: true,
  });

  process.on('SIGTERM', async () => {
    await Promise.all([
      modsWorker.close(),
      queueService.shutdown(),
      cronService.shutdown(),
    ]);
  });
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error('Error starting the application');
    process.exit(1);
  });
}
