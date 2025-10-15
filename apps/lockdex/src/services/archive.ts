import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Logger } from "@deadlock-mods/logging";
import { getTempDir } from "@/lib/temp-dir";
import type {
  ArchiveEntry,
  ExtractionOptions,
  ExtractionResult,
  StreamExtractionResult,
  TempDirResult,
} from "@/types/archive";

const PATH_NORMALIZATION_REGEX = /\\/g;
const UNSAFE_PATH_REGEX = /\.\.+/g;
const LEADING_SLASH_REGEX = /^\/+/;

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
    const extension = this.getFileExtension(filePath);
    return this.getSupportedExtensions().includes(extension);
  }

  /**
   * List all entries in the archive without extracting
   */
  abstract listEntries(archivePath: string): Promise<ArchiveEntry[]>;

  /**
   * Extract all files from archive to a directory
   */
  abstract extractAll(
    archivePath: string,
    options: ExtractionOptions,
  ): Promise<ExtractionResult>;

  /**
   * Extract a specific file from the archive as a stream
   */
  abstract extractFileStream(
    archivePath: string,
    filePath: string,
  ): Promise<StreamExtractionResult>;

  /**
   * Extract multiple specific files from the archive
   */
  abstract extractFiles(
    archivePath: string,
    filePaths: string[],
    targetDir: string,
  ): Promise<ExtractionResult>;

  /**
   * Get archive metadata (total files, compressed size, etc.)
   */
  async getArchiveInfo(archivePath: string): Promise<{
    totalFiles: number;
    totalDirectories: number;
    compressedSize: number;
    uncompressedSize: number;
    entries: ArchiveEntry[];
  }> {
    const entries = await this.listEntries(archivePath);

    return {
      totalFiles: entries.filter((e) => !e.isDirectory).length,
      totalDirectories: entries.filter((e) => e.isDirectory).length,
      compressedSize: 0, // To be implemented by concrete classes
      uncompressedSize: entries.reduce((sum, e) => sum + e.size, 0),
      entries,
    };
  }

  /**
   * Validate archive integrity
   */
  abstract validateArchive(archivePath: string): Promise<boolean>;

  /**
   * Helper method to get file extension
   */
  protected getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf(".");
    return lastDot === -1 ? "" : filePath.slice(lastDot).toLowerCase();
  }

  /**
   * Helper method to filter entries based on options
   */
  protected filterEntries(
    entries: ArchiveEntry[],
    options: ExtractionOptions,
  ): ArchiveEntry[] {
    return entries.filter((entry) => {
      // Skip directories if not preserving paths
      if (entry.isDirectory && !options.preservePaths) {
        return false;
      }

      // Filter by file extension
      if (options.fileExtensions?.length) {
        const ext = this.getFileExtension(entry.path);
        if (!options.fileExtensions.includes(ext)) {
          return false;
        }
      }

      // Filter by file size
      if (options.maxFileSize && entry.size > options.maxFileSize) {
        return false;
      }

      return true;
    });
  }

  /**
   * Helper method to ensure directory exists
   */
  protected async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  /**
   * Helper method to get safe file path (prevents directory traversal)
   */
  protected getSafeFilePath(basePath: string, filePath: string): string {
    const normalizedPath = filePath.replace(PATH_NORMALIZATION_REGEX, "/");
    const safePath = normalizedPath
      .replace(LEADING_SLASH_REGEX, "")
      .replace(UNSAFE_PATH_REGEX, "");
    return join(basePath, safePath);
  }

  /**
   * Helper method to create write stream with directory creation
   */
  protected async createSafeWriteStream(
    filePath: string,
  ): Promise<NodeJS.WritableStream> {
    await this.ensureDirectory(dirname(filePath));
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
    options?: Partial<ExtractionOptions>,
  ): Promise<ExtractionResult & TempDirResult> {
    const tempDir = await this.createTempDir();

    const extractionOptions: ExtractionOptions = {
      targetDir: tempDir.path,
      preservePaths: true,
      overwrite: true,
      ...options,
    };

    try {
      const result = await this.extractAll(archivePath, extractionOptions);

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
