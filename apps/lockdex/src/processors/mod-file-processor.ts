import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { RuntimeError } from "@deadlock-mods/common";
import { db, VpkRepository } from "@deadlock-mods/database";
import { BaseProcessor } from "@deadlock-mods/queue";
import { VpkParser } from "@deadlock-mods/vpk-parser";
import { logger } from "@/lib/logger";
import { archiveExtractorFactory } from "@/services/archive";
import { diskSpaceMonitor } from "@/services/disk-space-monitor";
import { downloadService } from "@/services/download";
import { sevenZipExtractor } from "@/services/extractors/7z-extractor";
import { rarExtractor } from "@/services/extractors/rar-extractor";
import { zipExtractor } from "@/services/extractors/zip-extractor";
import { tempCleanupService } from "@/services/temp-cleanup";
import type { ModFileProcessingJobData } from "@/types/jobs";

const MAX_FILE_SIZE = 256 * 1024 * 1024; // 256 MiB

export class ModFileProcessor extends BaseProcessor<ModFileProcessingJobData> {
  private static instance: ModFileProcessor | null = null;
  protected vpkRepository: VpkRepository;

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
    try {
      const identity = {
        provider: jobData.provider,
        submissionType: jobData.submissionType,
        submissionId: jobData.submissionId,
      };
      const upstreamUpdatedAt = new Date(jobData.upstreamUpdatedAt);
      if (Number.isNaN(upstreamUpdatedAt.getTime())) {
        throw new RuntimeError("Invalid upstream update marker");
      }
      if (
        await this.vpkRepository.isIngestionComplete(
          identity,
          jobData.fileId,
          upstreamUpdatedAt,
        )
      ) {
        this.logger.info(
          `Skipping completed GameBanana file ${jobData.fileId} at ${jobData.upstreamUpdatedAt}`,
        );
        return this.handleSuccess(jobData);
      }

      this.logger.info(
        `Processing GameBanana file ${jobData.fileId}: ${jobData.file} (${jobData.size} bytes)`,
      );

      // Check disk space before processing
      const hasSpace = await diskSpaceMonitor.hasSpaceForFile(jobData.size);
      if (!hasSpace) {
        this.logger.error("Insufficient disk space for processing mod file");

        // Try emergency cleanup
        try {
          await tempCleanupService.emergencyCleanup();

          // Check again after cleanup
          const hasSpaceAfterCleanup = await diskSpaceMonitor.hasSpaceForFile(
            jobData.size,
          );
          if (!hasSpaceAfterCleanup) {
            return this.handleError(
              new RuntimeError("Insufficient disk space even after cleanup"),
            );
          }
        } catch (cleanupError) {
          this.logger.withError(cleanupError).error("Emergency cleanup failed");
          return this.handleError(
            new RuntimeError("Insufficient disk space and cleanup failed"),
          );
        }
      }

      const downloadResult = await downloadService.downloadFile(jobData.url, {
        filename: jobData.file,
        timeout: 10 * 60 * 1000,
        maxFileSize: MAX_FILE_SIZE,
        progressInterval: 5 * 1024 * 1024,
        retryAttempts: 3,
        retryDelay: 2000,
      });

      this.logger.info(`Downloaded file to: ${downloadResult.filePath}`);

      try {
        const extractionResult = await this.extractArchive(
          downloadResult.filePath,
          jobData.file,
        );
        this.logger.info(`Extracted archive to: ${extractionResult.path}`);

        try {
          await this.listExtractedFiles(extractionResult.path);
          await this.parseVpkFiles(
            extractionResult.path,
            identity,
            jobData.fileId,
            upstreamUpdatedAt,
          );
          await this.vpkRepository.markIngestionComplete(
            identity,
            jobData.fileId,
            upstreamUpdatedAt,
          );

          return this.handleSuccess(jobData);
        } finally {
          // Clean up extracted files first
          await extractionResult.cleanup();
        }
      } finally {
        // Clean up download directory AFTER extraction and processing is complete
        // This ensures 7z child processes have released file handles
        await downloadResult.cleanup();
      }
    } catch (error) {
      this.logger.withError(error).error("Error processing mod file");

      // If it's a disk space error, try emergency cleanup
      if (
        error instanceof Error &&
        error.message.includes("No space left on device")
      ) {
        this.logger.warn(
          "Disk space error detected, attempting emergency cleanup",
        );
        try {
          await tempCleanupService.emergencyCleanup();
        } catch (cleanupError) {
          this.logger
            .withError(cleanupError)
            .error("Emergency cleanup failed after processing error");
        }
      }

      return this.handleError(error as Error);
    }
  }

  /**
   * Extract an archive file to a temporary directory
   */
  private async extractArchive(archivePath: string, filename: string) {
    const extractor = archiveExtractorFactory.getExtractor(filename);

    if (!extractor) {
      throw new RuntimeError(`No extractor available for file: ${filename}`);
    }

    this.logger.info(`Using ${extractor.constructor.name} for extraction`);

    const result = await extractor.extractToTempDir(archivePath);

    this.logger.info(
      `Extracted ${result.extractedFiles.length} files, ${result.errors.length} errors`,
    );

    if (result.errors.length > 0) {
      this.logger.warn(`Extraction errors: ${JSON.stringify(result.errors)}`);
    }

    return result;
  }

  /**
   * Recursively list all files in a directory and log them
   */
  private async listExtractedFiles(dirPath: string): Promise<void> {
    const listFiles = async (
      currentPath: string,
      prefix = "",
    ): Promise<void> => {
      try {
        const entries = await readdir(currentPath);

        for (const entry of entries) {
          const fullPath = join(currentPath, entry);
          const stats = await stat(fullPath);

          if (stats.isDirectory()) {
            this.logger.info(`${prefix}📁 ${entry}/`);
            await listFiles(fullPath, `${prefix}  `);
          } else {
            const sizeKB = (stats.size / 1024).toFixed(2);
            this.logger.info(`${prefix}📄 ${entry} (${sizeKB} KB)`);
          }
        }
      } catch (error) {
        this.logger
          .withError(error)
          .error(`Failed to list files in: ${currentPath}`);
      }
    };

    this.logger.info("📋 Extracted files:");
    await listFiles(dirPath);
  }

  /**
   * Find and parse all VPK files in the extracted directory
   */
  private async parseVpkFiles(
    dirPath: string,
    identity: {
      provider: "gamebanana";
      submissionType: "mod" | "sound";
      submissionId: string;
    },
    fileId: string,
    upstreamUpdatedAt: Date,
  ): Promise<void> {
    const vpkFiles = await this.findVpkFiles(dirPath);

    if (vpkFiles.length === 0) {
      this.logger.info("No VPK files found in extracted archive");
      return;
    }

    this.logger.info(`Found ${vpkFiles.length} VPK file(s) to parse`);

    for (const vpkPath of vpkFiles) {
      await this.parseVpkFile(
        vpkPath,
        identity,
        fileId,
        upstreamUpdatedAt,
        dirPath,
      );
    }
  }

  /**
   * Recursively find all VPK files in a directory
   */
  private async findVpkFiles(dirPath: string): Promise<string[]> {
    const vpkFiles: string[] = [];

    const searchDirectory = async (currentPath: string): Promise<void> => {
      try {
        const entries = await readdir(currentPath);

        for (const entry of entries) {
          const fullPath = join(currentPath, entry);
          const stats = await stat(fullPath);

          if (stats.isDirectory()) {
            await searchDirectory(fullPath);
          } else if (entry.toLowerCase().endsWith(".vpk")) {
            vpkFiles.push(fullPath);
          }
        }
      } catch (error) {
        this.logger
          .withError(error)
          .error(`Failed to search directory for VPK files: ${currentPath}`);
        throw error;
      }
    };

    await searchDirectory(dirPath);
    return vpkFiles;
  }

  /**
   * Parse a single VPK file and store it in the database
   */
  private async parseVpkFile(
    vpkPath: string,
    identity: {
      provider: "gamebanana";
      submissionType: "mod" | "sound";
      submissionId: string;
    },
    fileId: string,
    upstreamUpdatedAt: Date,
    extractionDir: string,
  ): Promise<void> {
    try {
      const vpkStats = await stat(vpkPath);

      this.logger.info(`Parsing VPK file: ${vpkPath} (${vpkStats.size} bytes)`);

      const parsed = VpkParser.parseFile(vpkPath, {
        includeFullFileHash: true,
        includeMerkle: true,
        includeEntries: false,
      });

      this.logger.debug(
        `VPK Info - Version: ${parsed.version}, FileCount: ${parsed.fingerprint.fileCount}, ` +
          `TreeLength: ${parsed.treeLength}, ManifestSHA256: ${parsed.manifestSha256}`,
      );

      const sourcePath = relative(extractionDir, vpkPath);
      const fp = parsed.fingerprint;
      const vpkData = {
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
        state: "ok" as const,
        fileMtime: fp.lastModified ? new Date(fp.lastModified) : null,
      };

      const storedVpk = await this.vpkRepository.upsertBySource(
        identity,
        fileId,
        sourcePath,
        vpkData,
      );

      this.logger.info(`Stored VPK in database with ID: ${storedVpk.id}`);
    } catch (error) {
      this.logger
        .withError(error)
        .error(`Failed to parse VPK file: ${vpkPath}`);
      throw error;
    }
  }
}

export const modFileProcessor = ModFileProcessor.getInstance();
