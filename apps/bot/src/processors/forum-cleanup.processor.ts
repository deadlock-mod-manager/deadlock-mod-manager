import { BaseProcessor } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import client from "@/lib/discord";
import { logger } from "@/lib/logger";
import { sweepForums } from "@/services/forum-lifecycle";
import type { CronJobData } from "@/types/jobs";

export class ForumCleanupProcessor extends BaseProcessor<CronJobData> {
  static #instance: ForumCleanupProcessor | null = null;

  static readonly cronPattern = CronPatterns.EVERY_HOUR;

  private constructor() {
    super(logger);
  }

  static get instance() {
    if (!ForumCleanupProcessor.#instance) {
      ForumCleanupProcessor.#instance = new ForumCleanupProcessor();
    }
    return ForumCleanupProcessor.#instance;
  }

  async process(jobData: CronJobData) {
    if (!client.isReady()) {
      logger.warn("Skipping forum cleanup, Discord client is not ready");
      return this.handleSuccess(jobData);
    }

    try {
      await sweepForums(client);
      return this.handleSuccess(jobData);
    } catch (error) {
      logger.withError(error).error("Forum cleanup job failed");
      return this.handleError(error as Error);
    }
  }
}
