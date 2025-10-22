import { db, MirroredFileRepository } from "@deadlock-mods/database";
import { BaseProcessor, type CronJobData } from "@deadlock-mods/queue";
import { logger } from "@/lib/logger";
import { S3Service } from "@/services/s3";

export class ValidationProcessor extends BaseProcessor<CronJobData> {
  private static instance: ValidationProcessor | null = null;
  private readonly mirroredFileRepository: MirroredFileRepository;

  private constructor() {
    super(logger);
    this.mirroredFileRepository = new MirroredFileRepository(db, this.logger);
  }

  static getInstance(): ValidationProcessor {
    if (!ValidationProcessor.instance) {
      ValidationProcessor.instance = new ValidationProcessor();
    }
    return ValidationProcessor.instance;
  }

  async process(_jobData: CronJobData) {
    const startTime = Date.now();
    let filesChecked = 0;
    let staleFilesFound = 0;
    let filesDeleted = 0;
    let errors = 0;

    try {
      this.logger.info("Starting validation worker");

      // Get all mirrored files with their related mod downloads
      const mirroredFilesResult =
        await this.mirroredFileRepository.findAllWithModDownloads();

      if (mirroredFilesResult.isErr()) {
        this.logger
          .withError(mirroredFilesResult.error)
          .error("Failed to fetch mirrored files");
        return this.handleError(mirroredFilesResult.error);
      }

      const mirroredFiles = mirroredFilesResult.value;
      this.logger
        .withMetadata({ totalFiles: mirroredFiles.length })
        .info("Processing mirrored files for validation");

      for (const mirroredFile of mirroredFiles) {
        try {
          filesChecked++;

          // Check if mod download still exists
          if (!mirroredFile.modDownload) {
            this.logger
              .withMetadata({
                mirroredFileId: mirroredFile.id,
                modDownloadId: mirroredFile.modDownloadId,
              })
              .warn("Mod download no longer exists, marking file for deletion");

            // Delete from S3
            const deleteResult = await S3Service.instance.deleteFile(
              mirroredFile.s3Key,
            );
            if (deleteResult.isErr()) {
              this.logger
                .withError(deleteResult.error)
                .withMetadata({ s3Key: mirroredFile.s3Key })
                .error("Failed to delete file from S3");
            } else {
              filesDeleted++;
            }

            // Remove from database
            const dbDeleteResult = await this.mirroredFileRepository.deleteById(
              mirroredFile.id,
            );
            if (dbDeleteResult.isErr()) {
              this.logger
                .withError(dbDeleteResult.error)
                .withMetadata({ mirroredFileId: mirroredFile.id })
                .error("Failed to delete mirrored file from database");
            }

            continue;
          }

          // Compare file sizes
          if (mirroredFile.fileSize !== mirroredFile.modDownload.size) {
            this.logger
              .withMetadata({
                mirroredFileId: mirroredFile.id,
                mirroredSize: mirroredFile.fileSize,
                currentSize: mirroredFile.modDownload.size,
                filename: mirroredFile.filename,
              })
              .info("File size mismatch detected, marking as stale");

            staleFilesFound++;

            // Delete old file from S3
            const deleteResult = await S3Service.instance.deleteFile(
              mirroredFile.s3Key,
            );
            if (deleteResult.isErr()) {
              this.logger
                .withError(deleteResult.error)
                .withMetadata({ s3Key: mirroredFile.s3Key })
                .error("Failed to delete stale file from S3");
            } else {
              filesDeleted++;
            }

            // Mark as stale in database
            const markStaleResult =
              await this.mirroredFileRepository.markAsStale(mirroredFile.id);
            if (markStaleResult.isErr()) {
              this.logger
                .withError(markStaleResult.error)
                .withMetadata({ mirroredFileId: mirroredFile.id })
                .error("Failed to mark file as stale");
            }
          } else {
            // Update last validated timestamp for files that are still valid
            const updateResult =
              await this.mirroredFileRepository.updateLastValidated(
                mirroredFile.id,
              );
            if (updateResult.isErr()) {
              this.logger
                .withError(updateResult.error)
                .withMetadata({ mirroredFileId: mirroredFile.id })
                .error("Failed to update last validated timestamp");
            }
          }
        } catch (error) {
          errors++;
          this.logger
            .withError(error)
            .withMetadata({ mirroredFileId: mirroredFile.id })
            .error("Error processing individual mirrored file");
        }
      }

      const duration = Date.now() - startTime;
      this.logger
        .withMetadata({
          filesChecked,
          staleFilesFound,
          filesDeleted,
          errors,
          durationMs: duration,
        })
        .info("Validation worker completed");

      return this.handleSuccess({
        filesChecked,
        staleFilesFound,
        filesDeleted,
        errors,
        durationMs: duration,
      });
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({
          filesChecked,
          staleFilesFound,
          filesDeleted,
          errors,
        })
        .error("Validation worker failed");
      return this.handleError(error as Error);
    }
  }
}

export const validationProcessor = ValidationProcessor.getInstance();
