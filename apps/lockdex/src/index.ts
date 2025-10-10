import { BaseWorker } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import { queueConfigs } from "./config/queues";
import { logger } from "./lib/logger";
import redis from "./lib/redis";
import { modFileProcessor } from "./processors/mod-file-processor";
import { modProcessor } from "./processors/mod-processor";
import { modsSchedulerProcessor } from "./processors/mods-scheduler";
import { tempCleanupProcessor } from "./processors/temp-cleanup-processor";
import { cronService } from "./services/cron";
import { diskHealthMonitor } from "./services/disk-health-monitor";
import { modFileProcessingQueue, modsQueue } from "./services/queue";
import { tempCleanupService } from "./services/temp-cleanup";

const main = async () => {
  // Initialize disk management services
  await tempCleanupService.initialize();
  diskHealthMonitor.start();

  const modsWorker = new BaseWorker(
    queueConfigs.mods.name,
    redis,
    logger,
    modProcessor,
    1,
  );
  const modFileWorker = new BaseWorker(
    queueConfigs.modFileProcessing.name,
    redis,
    logger,
    modFileProcessor,
    2,
  );

  await cronService.defineJob({
    name: "mods-scheduler",
    pattern: CronPatterns.EVERY_HOUR,
    processor: modsSchedulerProcessor,
    enabled: true,
  });

  await cronService.defineJob({
    name: "temp-cleanup",
    pattern: CronPatterns.EVERY_30_MINUTES,
    processor: tempCleanupProcessor,
    enabled: true,
  });

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, initiating graceful shutdown");

    await tempCleanupService.cleanupOldTempDirectories();

    await Promise.all([
      modsWorker.close(),
      modFileWorker.close(),
      modsQueue.close(),
      modFileProcessingQueue.close(),
      cronService.shutdown(),
      diskHealthMonitor.stop(),
    ]);

    logger.info("Graceful shutdown completed");
  });
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the application");
    process.exit(1);
  });
}
