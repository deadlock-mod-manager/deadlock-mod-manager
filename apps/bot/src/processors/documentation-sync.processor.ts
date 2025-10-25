import { BaseProcessor } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import { logger } from "@/lib/logger";
import { DocumentationSyncService } from "@/services/documentation-sync";
import type { CronJobData } from "@/types/jobs";

export class DocumentationSyncProcessor extends BaseProcessor<CronJobData> {
  static #instance: DocumentationSyncProcessor | null = null;
  private syncService: DocumentationSyncService;

  static readonly cronPattern = CronPatterns.DAILY;

  private constructor() {
    super(logger);
    this.syncService = new DocumentationSyncService();
  }

  static get instance() {
    if (!DocumentationSyncProcessor.#instance) {
      DocumentationSyncProcessor.#instance = new DocumentationSyncProcessor();
    }
    return DocumentationSyncProcessor.#instance;
  }

  async process(jobData: CronJobData) {
    try {
      logger.info("Processing documentation sync job");

      const syncResult = await this.syncService.sync();

      if (syncResult.skipped) {
        logger.info(syncResult.message);
      } else {
        logger
          .withMetadata({
            chunksProcessed: syncResult.chunksProcessed,
            contentHash: syncResult.contentHash,
          })
          .info(syncResult.message);
      }

      return this.handleSuccess(jobData);
    } catch (error) {
      logger.withError(error).error("Error processing documentation sync job");
      return this.handleError(error as Error);
    }
  }
}
