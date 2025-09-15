import { CronPatterns } from './lib/cron';
import { logger } from './lib/logger';
import { ModFileProcessor } from './processors/mod-file-processor';
import { ModProcessor } from './processors/mod-processor';
import { ModsSchedulerProcessor } from './processors/mods-scheduler';
import { CronService } from './services/cron';
import { queueService } from './services/queue';
import { ModFileWorker } from './workers/mod-file-worker';
import { ModsWorker } from './workers/mods-worker';

const main = async () => {
  const cronService = new CronService();

  const modsProcessor = new ModProcessor();
  const modFileProcessor = new ModFileProcessor();
  const modsScheduler = new ModsSchedulerProcessor();

  const modsWorker = new ModsWorker(modsProcessor, 1);
  const modFileWorker = new ModFileWorker(modFileProcessor, 1);

  await cronService.defineJob({
    name: 'mods-scheduler',
    pattern: CronPatterns.EVERY_6_HOURS,
    processor: modsScheduler,
    enabled: true,
  });

  process.on('SIGTERM', async () => {
    await Promise.all([
      modsWorker.close(),
      modFileWorker.close(),
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
