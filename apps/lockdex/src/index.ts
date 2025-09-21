import { BaseWorker } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import { queueConfigs } from "./config/queues";
import { logger } from "./lib/logger";
import redis from "./lib/redis";
import { modFileProcessor } from "./processors/mod-file-processor";
import { modProcessor } from "./processors/mod-processor";
import { modsSchedulerProcessor } from "./processors/mods-scheduler";
import { cronService } from "./services/cron";
import { modFileProcessingQueue, modsQueue } from "./services/queue";

const main = async () => {
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

  process.on("SIGTERM", async () => {
    await Promise.all([
      modsWorker.close(),
      modFileWorker.close(),
      modsQueue.close(),
      modFileProcessingQueue.close(),
      cronService.shutdown(),
    ]);
  });
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the application");
    process.exit(1);
  });
}
