import { db, ModRepository } from "@deadlock-mods/database";
import { BaseProcessor } from "@deadlock-mods/queue";
import { logger } from "@/lib/logger";
import { modsQueue } from "@/services/queue";
import { tempCleanupService } from "@/services/temp-cleanup";
import type { CronJobData } from "@/types/jobs";

const modRepository = new ModRepository(db);

export class ModsSchedulerProcessor extends BaseProcessor<CronJobData> {
  private static instance: ModsSchedulerProcessor | null = null;

  private constructor() {
    super(logger);
  }

  static getInstance(): ModsSchedulerProcessor {
    if (!ModsSchedulerProcessor.instance) {
      ModsSchedulerProcessor.instance = new ModsSchedulerProcessor();
    }
    return ModsSchedulerProcessor.instance;
  }

  async process(jobData: CronJobData) {
    try {
      logger.info(`Processing mods scheduler job: ${JSON.stringify(jobData)}`);

      try {
        const cleanupResult =
          await tempCleanupService.cleanupAllTempDirectories();
        logger.info(
          `Temp cleanup completed before mod indexing: ${cleanupResult.cleanedDirectories} directories cleaned, ` +
            `${(cleanupResult.freedBytes / 1024 / 1024).toFixed(2)} MB freed`,
        );
      } catch (error) {
        logger
          .withError(error)
          .warn("Temp cleanup failed before mod indexing, continuing anyway");
      }

      const mods = await modRepository.findAll();
      logger.info(`Found ${mods.length} mods, scheduling them for processing`);

      for (const mod of mods) {
        await modsQueue.processMod({
          modId: mod.id,
        });
        logger.info(`Scheduled mod ${mod.id} for processing`);
      }
      return this.handleSuccess(jobData);
    } catch (error) {
      logger.withError(error).error("Error processing mods scheduler job");
      return this.handleError(error as Error);
    }
  }
}

export const modsSchedulerProcessor = ModsSchedulerProcessor.getInstance();
