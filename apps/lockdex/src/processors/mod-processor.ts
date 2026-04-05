import { ValidationError } from "@deadlock-mods/common";
import {
  db,
  ModDownloadRepository,
  ModRepository,
  VpkRepository,
} from "@deadlock-mods/database";
import { BaseProcessor } from "@deadlock-mods/queue";
import { logger } from "@/lib/logger";
import { modFileProcessingQueue } from "@/services/queue";
import type { ModFileProcessingJobData, ModsJobData } from "@/types/jobs";

const modRepository = new ModRepository(db);
const modDownloadRepository = new ModDownloadRepository(db);
const vpkRepository = new VpkRepository(db);

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
        this.logger.debug(
          `Skipping mod ${mod.id} (${mod.name}) - no downloads found`,
        );
        return this.handleSuccess(jobData);
      }

      const unprocessedPayload: ModFileProcessingJobData[] = [];

      for (const download of downloads) {
        const existingVpks = await vpkRepository.findByModDownloadId(
          download.id,
        );
        if (existingVpks.length > 0) {
          continue;
        }
        unprocessedPayload.push({
          modId: mod.id,
          modDownloadId: download.id,
          url: download.url,
          file: download.file,
          size: download.size,
        });
      }

      if (unprocessedPayload.length === 0) {
        this.logger.debug(
          `Mod ${mod.id} (${mod.name}): all ${downloads.length} downloads already processed`,
        );
        return this.handleSuccess(jobData);
      }

      await modFileProcessingQueue.processModFiles(unprocessedPayload);
      this.logger.info(
        `Mod ${mod.id} (${mod.name}): enqueued ${unprocessedPayload.length}/${downloads.length} unprocessed downloads`,
      );

      return this.handleSuccess(jobData);
    } catch (error) {
      this.logger.withError(error).error("Error processing mod");
      return this.handleError(error as Error);
    }
  }
}

export const modProcessor = ModProcessor.getInstance();
