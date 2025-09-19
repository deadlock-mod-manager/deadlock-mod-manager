import { ValidationError } from "@deadlock-mods/common";
import {
  db,
  ModDownloadRepository,
  ModRepository,
} from "@deadlock-mods/database";
import { logger } from "@/lib/logger";
import { queueService } from "@/services/queue";
import type { ModFileProcessingJobData, ModsJobData } from "@/types/jobs";
import { BaseProcessor } from "./base";

const modRepository = new ModRepository(db);
const modDownloadRepository = new ModDownloadRepository(db);
export class ModProcessor extends BaseProcessor<ModsJobData> {
  private static instance: ModProcessor | null = null;

  private constructor() {
    super(logger);
  }

  static getInstance(): ModProcessor {
    if (!ModProcessor.instance) {
      ModProcessor.instance = new ModProcessor();
    }
    return ModProcessor.instance;
  }

  async process(jobData: ModsJobData) {
    try {
      const mod = await modRepository.findById(jobData.modId);
      if (!mod) {
        return this.handleError(new ValidationError("Mod not found"));
      }
      const downloads = await modDownloadRepository.findByModId(mod.id);
      if (!downloads || downloads.length === 0) {
        this.logger.info(
          `Skipping mod ${mod.id} (${mod.name}) - no downloads found`,
        );
        return this.handleSuccess(jobData);
      }

      const payload = downloads.map(
        (download) =>
          ({
            modId: mod.id,
            modDownloadId: download.id,
            url: download.url,
            file: download.file,
            size: download.size,
          }) satisfies ModFileProcessingJobData,
      );

      await queueService.addModFileProcessingJobs(payload);
      this.logger.info(`Added ${payload.length} mod file processing jobs`);

      return this.handleSuccess(jobData);
    } catch (error) {
      this.logger.withError(error).error("Error processing mod");
      return this.handleError(error as Error);
    }
  }
}

export const modProcessor = ModProcessor.getInstance();
