import { BaseWorker } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import { queueConfigs } from "./config/queues";
import { logger } from "./lib/logger";
import redis from "./lib/redis";
import { modFileProcessor } from "./processors/mod-file-processor";
import { tempCleanupProcessor } from "./processors/temp-cleanup-processor";
import { cronService } from "./services/cron";
import { diskHealthMonitor } from "./services/disk-health-monitor";
import { modFilesSubscriber } from "./services/mod-files-subscriber";
import { modFileProcessingQueue } from "./services/queue";
import { tempCleanupService } from "./services/temp-cleanup";

const main = async () => {
  // Initialize disk management services
  await tempCleanupService.initialize();
  diskHealthMonitor.start();

  const modFileWorker = new BaseWorker(
    queueConfigs.modFileProcessing.name,
    redis,
    logger,
    modFileProcessor,
    1,
  );

  await cronService.defineJob({
    name: "temp-cleanup",
    pattern: CronPatterns.EVERY_30_MINUTES,
    processor: tempCleanupProcessor,
    enabled: true,
  });

  cronService.start();
  await modFilesSubscriber.start();

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, initiating graceful shutdown");

    await tempCleanupService.cleanupOldTempDirectories();

    await Promise.all([
      modFileWorker.close(),
      modFileProcessingQueue.close(),
      modFilesSubscriber.stop(),
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
