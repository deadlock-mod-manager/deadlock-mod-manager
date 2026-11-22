import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { RuntimeError } from "@deadlock-mods/common";
import { db, type VpkIdentity, VpkRepository } from "@deadlock-mods/database";
import { BaseProcessor } from "@deadlock-mods/queue";
import { VpkParser } from "@deadlock-mods/vpk-parser";
import { env } from "@/lib/env";
import { isDiskSpaceError, PermanentIngestionError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { ingestionStats } from "@/lib/metrics";
import { Semaphore } from "@/lib/semaphore";
import { archiveExtractorFactory } from "@/services/archive";
import { diskSpaceMonitor } from "@/services/disk-space-monitor";
import { downloadService } from "@/services/download";
import { sevenZipExtractor } from "@/services/extractors/7z-extractor";
import { rarExtractor } from "@/services/extractors/rar-extractor";
import { zipExtractor } from "@/services/extractors/zip-extractor";
import { tempCleanupService } from "@/services/temp-cleanup";
import type { ModFileProcessingJobData } from "@/types/jobs";

export const MAX_FILE_SIZE = 256 * 1024 * 1024; // 256 MiB
const VPK_EXTENSION = ".vpk";

interface IndexSummary {
  vpks: number;
  duplicates: number;
  unreadable: number;
  extractionErrors: number;
}

export class ModFileProcessor extends BaseProcessor<ModFileProcessingJobData> {
  private static instance: ModFileProcessor | null = null;
  protected vpkRepository: VpkRepository;
  // Downloads overlap freely; extraction and hashing are what use memory
  private readonly processingSlots = new Semaphore(
    env.LOCKDEX_PROCESSING_CONCURRENCY,
  );

  private constructor() {
    super(logger);

    archiveExtractorFactory.registerExtractor(zipExtractor);
    archiveExtractorFactory.registerExtractor(rarExtractor);
    archiveExtractorFactory.registerExtractor(sevenZipExtractor);

    this.vpkRepository = new VpkRepository(db);
  }

  static getInstance(): ModFileProcessor {
    if (!ModFileProcessor.instance) {
      ModFileProcessor.instance = new ModFileProcessor();
    }
    return ModFileProcessor.instance;
  }

  async process(jobData: ModFileProcessingJobData) {
    const identity: VpkIdentity = {
      provider: jobData.provider,
      submissionType: jobData.submissionType,
      submissionId: jobData.submissionId,
    };
    const upstreamUpdatedAt = new Date(jobData.upstreamUpdatedAt);
    const log = this.logger.child().withContext({
      submissionId: jobData.submissionId,
      fileId: jobData.fileId,
      file: jobData.file,
      size: jobData.size,
    });

    try {
      if (Number.isNaN(upstreamUpdatedAt.getTime())) {
        throw new PermanentIngestionError("Invalid upstream update marker");
      }
      if (
        await this.vpkRepository.isIngestionComplete(
          identity,
          jobData.fileId,
          upstreamUpdatedAt,
        )
      ) {
        log.info("Skipping already indexed GameBanana file");
        ingestionStats.record("skipped");
        return this.handleSuccess(jobData);
      }

      await this.ensureDiskSpace(jobData.size);

      const startedAt = Date.now();
      ingestionStats.inFlight.downloading++;
      const download = await downloadService
        .downloadFile(jobData.url, {
          filename: jobData.file,
          timeout: 10 * 60 * 1000,
          maxFileSize: MAX_FILE_SIZE,
          progressInterval: 5 * 1024 * 1024,
          retryAttempts: 3,
          retryDelay: 2000,
        })
        .finally(() => {
          ingestionStats.inFlight.downloading--;
        });
      const downloadMs = Date.now() - startedAt;

      try {
        const queuedAt = Date.now();
        ingestionStats.inFlight.waitingForSlot++;
        const summary = await this.processingSlots.run(async () => {
          ingestionStats.inFlight.waitingForSlot--;
          ingestionStats.inFlight.processing++;
          const slotWaitMs = Date.now() - queuedAt;
          try {
            const result = await this.indexArchive(
              download.filePath,
              jobData,
              identity,
              upstreamUpdatedAt,
            );
            return {
              ...result,
              slotWaitMs,
              indexMs: Date.now() - queuedAt - slotWaitMs,
            };
          } finally {
            ingestionStats.inFlight.processing--;
          }
        });
        await this.vpkRepository.markIngestionComplete(
          identity,
          jobData.fileId,
          upstreamUpdatedAt,
        );

        ingestionStats.recordIndexed({
          timings: {
            downloadMs,
            slotWaitMs: summary.slotWaitMs,
            indexMs: summary.indexMs,
          },
          bytes: download.size,
          vpks: summary.vpks,
          duplicates: summary.duplicates,
          unreadable: summary.unreadable,
        });
        log
          .withMetadata({ ...summary, downloadMs })
          .info("Indexed GameBanana file");
        return this.handleSuccess(summary);
      } finally {
        await download.cleanup();
      }
    } catch (error) {
      if (error instanceof Error && isDiskSpaceError(error)) {
        log.warn("Disk space error detected, attempting emergency cleanup");
        try {
          await tempCleanupService.emergencyCleanup();
        } catch (cleanupError) {
          log
            .withError(cleanupError)
            .error("Emergency cleanup failed after processing error");
        }
      }

      if (error instanceof PermanentIngestionError) {
        // Recording the marker keeps the backfill from queueing this file again
        // until GameBanana reports new files for the submission
        if (!Number.isNaN(upstreamUpdatedAt.getTime())) {
          await this.vpkRepository.markIngestionComplete(
            identity,
            jobData.fileId,
            upstreamUpdatedAt,
          );
        }
        ingestionStats.record("permanent");
        log.withError(error).error("GameBanana file cannot be indexed");
        return this.handleError(error, { retryable: false });
      }

      ingestionStats.record("failed");
      log.withError(error).error("Error processing mod file");
      return this.handleError(error as Error);
    }
  }

  private async ensureDiskSpace(fileSize: number): Promise<void> {
    if (await diskSpaceMonitor.hasSpaceForFile(fileSize)) return;

    this.logger.warn("Low disk space, running emergency cleanup");
    await tempCleanupService.emergencyCleanup();
    if (!(await diskSpaceMonitor.hasSpaceForFile(fileSize))) {
      throw new RuntimeError("Insufficient disk space even after cleanup");
    }
  }

  private async indexArchive(
    archivePath: string,
    jobData: ModFileProcessingJobData,
    identity: VpkIdentity,
    upstreamUpdatedAt: Date,
  ): Promise<IndexSummary> {
    const extractor = archiveExtractorFactory.getExtractor(jobData.file);
    if (!extractor) {
      throw new PermanentIngestionError(
        `No extractor available for file: ${jobData.file}`,
      );
    }

    const extraction = await extractor
      .extractToTempDir(archivePath, { fileExtensions: [VPK_EXTENSION] })
      .catch((error: Error) => {
        throw isDiskSpaceError(error)
          ? error
          : new PermanentIngestionError(
              "Archive could not be extracted",
              error,
            );
      });

    try {
      if (extraction.errors.length > 0) {
        this.logger
          .withMetadata({ fileId: jobData.fileId, errors: extraction.errors })
          .warn("Some archive entries failed to extract");
      }

      const summary: IndexSummary = {
        vpks: 0,
        duplicates: 0,
        unreadable: 0,
        extractionErrors: extraction.errors.length,
      };
      const entries = await readdir(extraction.path, { recursive: true });
      for (const sourcePath of entries) {
        if (!sourcePath.toLowerCase().endsWith(VPK_EXTENSION)) continue;
        summary.vpks++;

        const outcome = await this.indexVpk(
          join(extraction.path, sourcePath),
          sourcePath,
          identity,
          jobData.fileId,
          upstreamUpdatedAt,
        );
        if (outcome === "duplicate") summary.duplicates++;
        if (outcome === "unreadable") summary.unreadable++;
      }
      return summary;
    } finally {
      await extraction.cleanup();
    }
  }

  private async indexVpk(
    vpkPath: string,
    sourcePath: string,
    identity: VpkIdentity,
    fileId: string,
    upstreamUpdatedAt: Date,
  ) {
    let parsed: ReturnType<typeof VpkParser.parseFile>;
    try {
      parsed = VpkParser.parseFile(vpkPath, {
        includeMerkle: true,
        includeEntries: false,
      });
    } catch (error) {
      // One broken VPK should not cost the rest of the archive
      this.logger
        .withError(error)
        .withMetadata({ fileId, sourcePath })
        .warn("Skipping unreadable VPK");
      return "unreadable" as const;
    }

    const fp = parsed.fingerprint;
    const { outcome } = await this.vpkRepository.upsertBySource(
      identity,
      fileId,
      sourcePath,
      {
        ...identity,
        fileId,
        upstreamUpdatedAt,
        sourcePath,
        sizeBytes: fp.fileSize,
        fastHash: fp.fastHash,
        sha256: fp.sha256,
        contentSig: fp.contentSignature,
        vpkVersion: fp.vpkVersion,
        fileCount: fp.fileCount,
        hasMultiparts: fp.hasMultiparts,
        hasInlineData: fp.hasInlineData,
        merkleRoot: fp.merkleRoot,
        state: "ok",
        fileMtime: fp.lastModified ? new Date(fp.lastModified) : null,
      },
    );
    return outcome;
  }
}

export const modFileProcessor = ModFileProcessor.getInstance();
