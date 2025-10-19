import { db, MirroredFileRepository } from "@deadlock-mods/database";
import { BaseProcessor, type CronJobData } from "@deadlock-mods/queue";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { S3Service } from "@/services/s3";

export class CleanupProcessor extends BaseProcessor<CronJobData> {
  private static instance: CleanupProcessor | null = null;
  private readonly mirroredFileRepository: MirroredFileRepository;

  private constructor() {
    super(logger);
    this.mirroredFileRepository = new MirroredFileRepository(db, this.logger);
  }

  static getInstance(): CleanupProcessor {
    if (!CleanupProcessor.instance) {
      CleanupProcessor.instance = new CleanupProcessor();
    }
    return CleanupProcessor.instance;
  }

  async process(_jobData: CronJobData) {
    const startTime = Date.now();
    let filesDeleted = 0;
    let storageFreed = 0;
    let errors = 0;

    try {
      this.logger.info("Starting cleanup worker");

      // Find unused files based on retention policy
      const unusedFilesResult =
        await this.mirroredFileRepository.findUnusedFiles(
          env.CLEANUP_RETENTION_DAYS,
        );

      if (unusedFilesResult.isErr()) {
        this.logger
          .withError(unusedFilesResult.error)
          .error("Failed to fetch unused files");
        return this.handleError(unusedFilesResult.error);
      }

      const unusedFiles = unusedFilesResult.value;
      this.logger
        .withMetadata({
          retentionDays: env.CLEANUP_RETENTION_DAYS,
          totalFiles: unusedFiles.length,
        })
        .info("Processing unused files for cleanup");

      for (const file of unusedFiles) {
        try {
          // Delete from S3
          const deleteResult = await S3Service.instance.deleteFile(file.s3Key);
          if (deleteResult.isErr()) {
            this.logger
              .withError(deleteResult.error)
              .withMetadata({ s3Key: file.s3Key, filename: file.filename })
              .error("Failed to delete file from S3");
            errors++;
            continue;
          }

          // Remove from database
          const dbDeleteResult = await this.mirroredFileRepository.deleteById(
            file.id,
          );
          if (dbDeleteResult.isErr()) {
            this.logger
              .withError(dbDeleteResult.error)
              .withMetadata({
                mirroredFileId: file.id,
                filename: file.filename,
              })
              .error("Failed to delete mirrored file from database");
            errors++;
            continue;
          }

          filesDeleted++;
          storageFreed += file.fileSize;

          this.logger
            .withMetadata({
              filename: file.filename,
              fileSize: file.fileSize,
              lastDownloadedAt: file.lastDownloadedAt,
            })
            .debug("Deleted unused file");
        } catch (error) {
          errors++;
          this.logger
            .withError(error)
            .withMetadata({ mirroredFileId: file.id, filename: file.filename })
            .error("Error processing individual file for cleanup");
        }
      }

      const duration = Date.now() - startTime;
      const storageFreedMB =
        Math.round((storageFreed / (1024 * 1024)) * 100) / 100;

      this.logger
        .withMetadata({
          filesDeleted,
          storageFreedMB,
          errors,
          durationMs: duration,
          retentionDays: env.CLEANUP_RETENTION_DAYS,
        })
        .info("Cleanup worker completed");

      return this.handleSuccess({
        filesDeleted,
        storageFreedMB,
        errors,
        durationMs: duration,
      });
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({
          filesDeleted,
          storageFreedMB:
            Math.round((storageFreed / (1024 * 1024)) * 100) / 100,
          errors,
        })
        .error("Cleanup worker failed");
      return this.handleError(error as Error);
    }
  }
}

export const cleanupProcessor = CleanupProcessor.getInstance();
