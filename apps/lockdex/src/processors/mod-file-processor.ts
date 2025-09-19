import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { ValidationError } from "@deadlock-mods/common";
import { modDownloadRepository, vpkRepository } from "@deadlock-mods/database";
import { VpkParser } from "@deadlock-mods/vpk-parser";
import { logger } from "@/lib/logger";
import { archiveExtractorFactory } from "@/services/archive";
import { downloadService } from "@/services/download";
import { sevenZipExtractor } from "@/services/extractors/7z-extractor";
import { rarExtractor } from "@/services/extractors/rar-extractor";
import { zipExtractor } from "@/services/extractors/zip-extractor";
import type { ModFileProcessingJobData } from "@/types/jobs";
import { BaseProcessor } from "./base";

export class ModFileProcessor extends BaseProcessor<ModFileProcessingJobData> {
  private static instance: ModFileProcessor | null = null;

  private constructor() {
    super(logger);

    archiveExtractorFactory.registerExtractor(zipExtractor);
    archiveExtractorFactory.registerExtractor(rarExtractor);
    archiveExtractorFactory.registerExtractor(sevenZipExtractor);
  }

  static getInstance(): ModFileProcessor {
    if (!ModFileProcessor.instance) {
      ModFileProcessor.instance = new ModFileProcessor();
    }
    return ModFileProcessor.instance;
  }

  async process(jobData: ModFileProcessingJobData) {
    try {
      const modDownload = await modDownloadRepository.findById(
        jobData.modDownloadId,
      );
      if (!modDownload) {
        return this.handleError(
          new ValidationError(
            `ModDownload not found: ${jobData.modDownloadId}`,
          ),
        );
      }

      // Check if this mod download has already been processed by looking for VPK entries
      const existingVpks = await vpkRepository.findByModDownloadId(
        jobData.modDownloadId,
      );
      if (existingVpks.length > 0) {
        this.logger.info(
          `Skipping already processed mod file: ${jobData.file} for modDownloadId: ${jobData.modDownloadId} (found ${existingVpks.length} existing VPK entries)`,
        );
        return this.handleSuccess(jobData);
      }

      this.logger.info(
        `Processing mod file: ${jobData.file} (${jobData.size} bytes) for modDownloadId: ${jobData.modDownloadId}`,
      );

      await using downloadResult = await downloadService.downloadFile(
        jobData.url,
        {
          filename: jobData.file,
          timeout: 10 * 60 * 1000,
          maxFileSize: 256 * 1024 * 1024,
          progressInterval: 5 * 1024 * 1024,
          retryAttempts: 3,
          retryDelay: 2000,
        },
      );

      this.logger.info(`Downloaded file to: ${downloadResult.filePath}`);

      await using extractionResult = await this.extractArchive(
        downloadResult.filePath,
        jobData.file,
      );
      this.logger.info(`Extracted archive to: ${extractionResult.path}`);

      await this.listExtractedFiles(extractionResult.path);

      await this.parseVpkFiles(extractionResult.path, modDownload);

      return this.handleSuccess(jobData);
    } catch (error) {
      this.logger.withError(error).error("Error processing mod file");
      return this.handleError(error as Error);
    }
  }

  /**
   * Extract an archive file to a temporary directory
   */
  private async extractArchive(archivePath: string, filename: string) {
    const extractor = archiveExtractorFactory.getExtractor(filename);

    if (!extractor) {
      throw new Error(`No extractor available for file: ${filename}`);
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
    modDownload: { id: string; modId: string },
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
        modDownload.modId,
        modDownload.id,
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
    modId: string,
    modDownloadId: string,
    extractionDir: string,
  ): Promise<void> {
    try {
      const vpkBuffer = await readFile(vpkPath);

      this.logger.info(
        `Parsing VPK file: ${vpkPath} (${vpkBuffer.length} bytes)`,
      );

      const stats = await stat(vpkPath);

      const parsed = await VpkParser.parse(vpkBuffer, {
        includeFullFileHash: true,
        filePath: vpkPath,
        lastModified: stats.mtime,
        includeMerkle: true,
      });

      this.logger.debug(
        `VPK Info - Version: ${parsed.version}, Entries: ${parsed.entries.length}, ` +
          `TreeLength: ${parsed.treeLength}, ManifestSHA256: ${parsed.manifestSha256}`,
      );

      const sourcePath = relative(extractionDir, vpkPath);
      const fp = parsed.fingerprint;
      const vpkData = {
        modId,
        modDownloadId,
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
        fileMtime: fp.lastModified,
      };

      const storedVpk = await vpkRepository.upsertByModDownloadIdAndSourcePath(
        modDownloadId,
        sourcePath,
        vpkData,
      );

      // Check if this VPK belongs to our mod download or if it's a duplicate from another source
      if (
        storedVpk.modDownloadId === modDownloadId &&
        storedVpk.sourcePath === sourcePath
      ) {
        this.logger.info(`Stored VPK in database with ID: ${storedVpk.id}`);
      } else {
        this.logger.warn(
          `VPK file ${vpkPath} has duplicate content (SHA256: ${vpkData.sha256}). ` +
            `Using existing VPK record (ID: ${storedVpk.id}) from modDownloadId: ${storedVpk.modDownloadId}`,
        );
      }
    } catch (error) {
      this.logger
        .withError(error)
        .error(`Failed to parse VPK file: ${vpkPath}`);
    }
  }
}

export const modFileProcessor = ModFileProcessor.getInstance();
