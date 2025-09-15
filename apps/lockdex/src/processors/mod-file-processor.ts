import { join } from 'node:path';
import { logger } from '@/lib/logger';
import { ArchiveExtractorFactory } from '@/services/archive';
import { DownloadService } from '@/services/download';
import { SevenZipExtractor } from '@/services/extractors/7z-extractor';
import { RarExtractor } from '@/services/extractors/rar-extractor';
import { ZipExtractor } from '@/services/extractors/zip-extractor';
import type { ModFileProcessingJobData } from '@/types/jobs';
import { BaseProcessor } from './base';

export class ModFileProcessor extends BaseProcessor<ModFileProcessingJobData> {
  private extractorFactory: ArchiveExtractorFactory;
  private downloadService: DownloadService;

  constructor() {
    super(logger);

    this.extractorFactory = new ArchiveExtractorFactory();
    this.extractorFactory.registerExtractor(new ZipExtractor(this.logger));
    this.extractorFactory.registerExtractor(new RarExtractor(this.logger));
    this.extractorFactory.registerExtractor(new SevenZipExtractor(this.logger));

    this.downloadService = new DownloadService(this.logger);
  }

  async process(jobData: ModFileProcessingJobData) {
    try {
      this.logger.info(
        `Processing mod file: ${jobData.file} (${jobData.size} bytes)`
      );

      await using downloadResult = await this.downloadService.downloadFile(
        jobData.url,
        {
          filename: jobData.file,
          timeout: 10 * 60 * 1000,
          maxFileSize: 1024 * 1024 * 1024,
          progressInterval: 5 * 1024 * 1024,
          retryAttempts: 3,
          retryDelay: 2000,
        }
      );

      this.logger.info(`Downloaded file to: ${downloadResult.filePath}`);

      await using extractionResult = await this.extractArchive(
        downloadResult.filePath,
        jobData.file
      );
      this.logger.info(`Extracted archive to: ${extractionResult.path}`);

      await this.listExtractedFiles(extractionResult.path);

      return this.handleSuccess(jobData);
    } catch (error) {
      this.logger.withError(error).error('Error processing mod file');
      return this.handleError(error as Error);
    }
  }

  /**
   * Extract an archive file to a temporary directory
   */
  private async extractArchive(archivePath: string, filename: string) {
    const extractor = this.extractorFactory.getExtractor(filename);

    if (!extractor) {
      throw new Error(`No extractor available for file: ${filename}`);
    }

    this.logger.info(`Using ${extractor.constructor.name} for extraction`);

    const result = await extractor.extractToTempDir(archivePath);

    this.logger.info(
      `Extracted ${result.extractedFiles.length} files, ${result.errors.length} errors`
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
    const { readdir, stat } = await import('node:fs/promises');

    const listFiles = async (
      currentPath: string,
      prefix = ''
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

    this.logger.info('📋 Extracted files:');
    await listFiles(dirPath);
  }
}
