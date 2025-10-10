import { BaseProcessor } from "@deadlock-mods/queue";
import { logger } from "@/lib/logger";
import { tempCleanupService } from "@/services/temp-cleanup";
import type { TempCleanupJobData } from "@/types/jobs";

export class TempCleanupProcessor extends BaseProcessor<TempCleanupJobData> {
  private static instance: TempCleanupProcessor | null = null;

  private constructor() {
    super(logger);
  }

  static getInstance(): TempCleanupProcessor {
    if (!TempCleanupProcessor.instance) {
      TempCleanupProcessor.instance = new TempCleanupProcessor();
    }
    return TempCleanupProcessor.instance;
  }

  async process(_jobData: TempCleanupJobData) {
    try {
      this.logger.info("Starting periodic temp directory cleanup");

      const result = await tempCleanupService.cleanupOldTempDirectories();

      this.logger.info(
        `Periodic cleanup completed: ${result.cleanedDirectories} directories, ` +
          `${(result.freedBytes / 1024 / 1024).toFixed(2)} MB freed`,
      );

      if (result.errors.length > 0) {
        this.logger.warn(
          `Cleanup had ${result.errors.length} errors: ${JSON.stringify(result.errors)}`,
        );
      }

      return this.handleSuccess({
        ...result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.withError(error).error("Periodic temp cleanup failed");
      return this.handleError(error as Error);
    }
  }
}

export const tempCleanupProcessor = TempCleanupProcessor.getInstance();
