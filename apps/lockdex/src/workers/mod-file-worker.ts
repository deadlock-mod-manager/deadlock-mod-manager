import { queueConfigs } from "@/config/queues";
import { logger } from "@/lib/logger";
import type { ModFileProcessor } from "@/processors/mod-file-processor";
import type { ModFileProcessingJobData } from "@/types/jobs";
import { BaseWorker } from "./base";

export class ModFileWorker extends BaseWorker<ModFileProcessingJobData> {
  constructor(modProcessor: ModFileProcessor, concurrency = 1) {
    super(
      queueConfigs.modFileProcessing.name,
      logger,
      modProcessor,
      concurrency,
    );
  }
}
