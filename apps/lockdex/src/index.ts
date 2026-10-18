import { BaseWorker } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import { queueConfigs } from "./config/queues";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import redis from "./lib/redis";
import { ingestionBackfillProcessor } from "./processors/ingestion-backfill-processor";
import { modFileProcessor } from "./processors/mod-file-processor";
import { tempCleanupProcessor } from "./processors/temp-cleanup-processor";
import { cronService } from "./services/cron";
import { diskHealthMonitor } from "./services/disk-health-monitor";
import { metricsServer } from "./services/metrics-server";
import { modFilesSubscriber } from "./services/mod-files-subscriber";
import { modFileProcessingQueue } from "./services/queue";
import { tempCleanupService } from "./services/temp-cleanup";

const main = async () => {
  // Initialize disk management services
  await tempCleanupService.initialize();
  diskHealthMonitor.start();

  // Each job is mostly download time; the processor gates the memory-heavy part
  const modFileWorker = new BaseWorker(
    queueConfigs.modFileProcessing.name,
    redis,
    logger,
    modFileProcessor,
    env.LOCKDEX_DOWNLOAD_CONCURRENCY,
  );

  await cronService.defineJob({
    name: "temp-cleanup",
    pattern: CronPatterns.EVERY_30_MINUTES,
    processor: tempCleanupProcessor,
    enabled: true,
  });
  await cronService.defineJob({
    name: "ingestion-backfill",
    pattern: CronPatterns.EVERY_5_MINUTES,
    processor: ingestionBackfillProcessor,
    enabled: true,
  });

  cronService.start();
  await modFilesSubscriber.start();
  metricsServer.start();

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, initiating graceful shutdown");

    await tempCleanupService.cleanupOldTempDirectories();

    await Promise.all([
      modFileWorker.close(),
      modFileProcessingQueue.close(),
      modFilesSubscriber.stop(),
      cronService.shutdown(),
      diskHealthMonitor.stop(),
      metricsServer.stop(),
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
