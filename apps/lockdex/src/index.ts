import { CronPatterns } from "./lib/cron";
import { logger } from "./lib/logger";
import { modFileProcessor } from "./processors/mod-file-processor";
import { modProcessor } from "./processors/mod-processor";
import { modsSchedulerProcessor } from "./processors/mods-scheduler";
import { cronService } from "./services/cron";
import { queueService } from "./services/queue";
import { ModFileWorker } from "./workers/mod-file-worker";
import { ModsWorker } from "./workers/mods-worker";

const main = async () => {
  const modsWorker = new ModsWorker(modProcessor, 1);
  const modFileWorker = new ModFileWorker(modFileProcessor, 2);

  await cronService.defineJob({
    name: "mods-scheduler",
    pattern: CronPatterns.EVERY_6_HOURS,
    processor: modsSchedulerProcessor,
    enabled: true,
  });

  process.on("SIGTERM", async () => {
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
    logger.withError(error).error("Error starting the application");
    process.exit(1);
  });
}
