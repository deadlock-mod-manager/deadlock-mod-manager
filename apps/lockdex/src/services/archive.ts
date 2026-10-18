import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Logger } from "@deadlock-mods/logging";
import { fileExtension } from "@/lib/archive-paths";
import { getTempDir } from "@/lib/temp-dir";
import type {
  ExtractionOptions,
  ExtractionResult,
  TempDirResult,
} from "@/types/archive";

export abstract class ArchiveExtractor {
  protected logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child().withContext({
      extractor: this.constructor.name,
    });
  }

  /**
   * Get the list of supported file extensions for this extractor
   */
  abstract getSupportedExtensions(): string[];

  /**
   * Check if this extractor can handle the given file
   */
  canHandle(filePath: string): boolean {
    return this.getSupportedExtensions().includes(fileExtension(filePath));
  }

  /**
   * Extract the entries matching `options.fileExtensions` into `options.targetDir`,
   * keeping their paths inside the archive
   */
  abstract extractAll(
    archivePath: string,
    options: ExtractionOptions,
  ): Promise<ExtractionResult>;

  /**
   * Helper method to create write stream with directory creation
   */
  protected async createSafeWriteStream(
    filePath: string,
  ): Promise<NodeJS.WritableStream> {
    await mkdir(dirname(filePath), { recursive: true });
    return createWriteStream(filePath);
  }

  protected async createTempDir(
    prefix = "archive-extract-",
  ): Promise<TempDirResult> {
    const baseTempDir = await getTempDir();
    const tempDirPath = await mkdtemp(join(baseTempDir, prefix));

    this.logger.debug(`Created temporary directory: ${tempDirPath}`);

    const cleanup = async () => {
      try {
        await rm(tempDirPath, { recursive: true, force: true });
        this.logger.debug(`Cleaned up temporary directory: ${tempDirPath}`);
      } catch (error) {
        this.logger
          .withError(error)
          .warn(`Failed to cleanup temporary directory: ${tempDirPath}`);
      }
    };

    return {
      path: tempDirPath,
      cleanup,
      [Symbol.asyncDispose]: cleanup,
    };
  }

  async extractToTempDir(
    archivePath: string,
    options: Omit<ExtractionOptions, "targetDir"> = {},
  ): Promise<ExtractionResult & TempDirResult> {
    const tempDir = await this.createTempDir();

    try {
      const result = await this.extractAll(archivePath, {
        ...options,
        targetDir: tempDir.path,
      });

      return {
        ...result,
        path: tempDir.path,
        cleanup: tempDir.cleanup,
        [Symbol.asyncDispose]: tempDir.cleanup,
      };
    } catch (error) {
      await tempDir.cleanup();
      throw error;
    }
  }
}

/**
 * Factory class to get the appropriate extractor for a file
 */
export class ArchiveExtractorFactory {
  private static instance: ArchiveExtractorFactory | null = null;
  private extractors: ArchiveExtractor[] = [];

  private constructor() {}

  static getInstance(): ArchiveExtractorFactory {
    if (!ArchiveExtractorFactory.instance) {
      ArchiveExtractorFactory.instance = new ArchiveExtractorFactory();
    }
    return ArchiveExtractorFactory.instance;
  }

  /**
   * Register an extractor
   */
  registerExtractor(extractor: ArchiveExtractor): void {
    this.extractors.push(extractor);
  }

  /**
   * Get the appropriate extractor for a file
   */
  getExtractor(filePath: string): ArchiveExtractor | null {
    return (
      this.extractors.find((extractor) => extractor.canHandle(filePath)) || null
    );
  }

  /**
   * Get all supported extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(
      new Set(
        this.extractors.flatMap((extractor) =>
          extractor.getSupportedExtensions(),
        ),
      ),
    );
  }
}

export const archiveExtractorFactory = ArchiveExtractorFactory.getInstance();
