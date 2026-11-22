import { db, VpkRepository } from "@deadlock-mods/database";
import { BaseProcessor } from "@deadlock-mods/queue";
import { logger } from "@/lib/logger";
import { ingestionStats } from "@/lib/metrics";
import { archiveExtractorFactory } from "@/services/archive";
import { modFileProcessingQueue } from "@/services/queue";
import type { IngestionBackfillJobData } from "@/types/jobs";
import { MAX_FILE_SIZE } from "./mod-file-processor";

const TARGET_QUEUE_DEPTH = 300;
const BACKFILL_PRIORITY = 10;

class IngestionBackfillProcessor extends BaseProcessor<IngestionBackfillJobData> {
  private static instance: IngestionBackfillProcessor | null = null;
  private readonly vpkRepository = new VpkRepository(db);

  private constructor() {
    super(logger);
  }

  static getInstance(): IngestionBackfillProcessor {
    if (!IngestionBackfillProcessor.instance) {
      IngestionBackfillProcessor.instance = new IngestionBackfillProcessor();
    }
    return IngestionBackfillProcessor.instance;
  }

  async process(_jobData: IngestionBackfillJobData) {
    try {
      const unfinished = await modFileProcessingQueue.countUnfinished();
      if (unfinished >= TARGET_QUEUE_DEPTH) {
        return this.handleSuccess({ unfinished, scheduled: 0 });
      }

      const downloads = await this.vpkRepository.findUningestedDownloads({
        limit: TARGET_QUEUE_DEPTH,
        maxSizeBytes: MAX_FILE_SIZE,
        extensions: archiveExtractorFactory
          .getSupportedExtensions()
          .map((ext) => ext.slice(1)),
      });
      await modFileProcessingQueue.processModFiles(
        downloads.map((download) => ({
          provider: "gamebanana",
          submissionType: download.submissionType,
          submissionId: download.submissionId,
          fileId: download.fileId,
          upstreamUpdatedAt: download.upstreamUpdatedAt,
          url: download.url,
          file: download.file,
          size: download.size,
        })),
        { priority: BACKFILL_PRIORITY },
      );
      ingestionStats.recordBackfill(downloads.length);

      this.logger
        .withMetadata({ unfinished, scheduled: downloads.length })
        .info("Scheduled GameBanana files without an ingestion");
      return this.handleSuccess({ unfinished, scheduled: downloads.length });
    } catch (error) {
      this.logger.withError(error).error("Ingestion backfill failed");
      return this.handleError(error as Error);
    }
  }
}

export const ingestionBackfillProcessor =
  IngestionBackfillProcessor.getInstance();
