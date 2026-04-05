import fs, { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ExtractionError } from "@deadlock-mods/common";
import { createExtractorFromData, UnrarError } from "node-unrar-js";
import { logger } from "@/lib/logger";
import type {
  ArchiveEntry,
  ExtractionOptions,
  ExtractionResult,
  StreamExtractionResult,
} from "@/types/archive";
import { ArchiveExtractor } from "../archive";

export class RarExtractor extends ArchiveExtractor {
  private static instance: RarExtractor | null = null;

  private constructor() {
    super(logger);
  }

  static getInstance(): RarExtractor {
    if (!RarExtractor.instance) {
      RarExtractor.instance = new RarExtractor();
    }
    return RarExtractor.instance;
  }

  getSupportedExtensions(): string[] {
    return [".rar"];
  }

  private async readArchiveBuffer(archivePath: string): Promise<ArrayBuffer> {
    const buffer = await fs.readFile(archivePath);
    return new Uint8Array(buffer).buffer;
  }

  private async listEntriesFromData(
    data: ArrayBuffer,
    archivePath: string,
  ): Promise<ArchiveEntry[]> {
    const extractor = await createExtractorFromData({ data });
    const entries: ArchiveEntry[] = [];

    for (const header of extractor.getFileList().fileHeaders) {
      entries.push({
        path: header.name,
        size: header.unpSize,
        isDirectory: header.flags.directory,
        modifiedAt: header.time ? new Date(header.time) : undefined,
        compressionRatio:
          header.packSize > 0 ? 1 - header.packSize / header.unpSize : 0,
      });
    }

    this.logger.info(
      `Listed ${entries.length} entries from ${basename(archivePath)}`,
    );
    return entries;
  }

  async listEntries(archivePath: string): Promise<ArchiveEntry[]> {
    try {
      const data = await this.readArchiveBuffer(archivePath);
      return await this.listEntriesFromData(data, archivePath);
    } catch (error) {
      this.logUnrarError(error, "Failed to list RAR entries");
      throw error;
    }
  }

  async extractAll(
    archivePath: string,
    options: ExtractionOptions,
  ): Promise<ExtractionResult> {
    const result: ExtractionResult = {
      extractedFiles: [],
      skippedFiles: [],
      errors: [],
      totalBytes: 0,
    };

    try {
      const data = await this.readArchiveBuffer(archivePath);
      const entries = await this.listEntriesFromData(data, archivePath);
      const filteredEntries = this.filterEntries(entries, options);

      const fileNamesToExtract = filteredEntries
        .filter((entry) => !entry.isDirectory)
        .map((entry) => entry.path);

      if (fileNamesToExtract.length === 0) {
        return result;
      }

      const extractor = await createExtractorFromData({ data });
      const extracted = extractor.extract({ files: fileNamesToExtract });

      // Iterate the generator lazily instead of Array.from() to avoid
      // holding all decompressed file buffers in memory simultaneously
      for (const file of extracted.files) {
        try {
          const entry = filteredEntries.find(
            (e) => e.path === file.fileHeader.name,
          );
          if (!entry) {
            continue;
          }

          if (entry.isDirectory) {
            if (options.preservePaths) {
              const dirPath = this.getSafeFilePath(
                options.targetDir,
                entry.path,
              );
              await this.ensureDirectory(dirPath);
            }
            continue;
          }

          const targetPath = this.getSafeFilePath(
            options.targetDir,
            options.preservePaths ? entry.path : basename(entry.path),
          );

          if (!options.overwrite) {
            try {
              await stat(targetPath);
              result.skippedFiles.push(entry.path);
              continue;
            } catch {
              // File doesn't exist, proceed with extraction
            }
          }

          if (file.extraction) {
            const writeStream = await this.createSafeWriteStream(targetPath);
            const readableStream = new Readable({
              read() {
                this.push(Buffer.from(file.extraction!));
                this.push(null);
              },
            });

            await pipeline(readableStream, writeStream);

            result.extractedFiles.push(entry.path);
            result.totalBytes += entry.size;

            this.logger.debug(`Extracted ${entry.path} to ${targetPath}`);
          }
        } catch (error) {
          const entryPath = file.fileHeader?.name || "unknown";
          let errorMsg: string;
          if (error instanceof UnrarError) {
            errorMsg = `${error.reason}${error.file ? ` (file: ${error.file})` : ""}`;
          } else if (error instanceof Error) {
            errorMsg = error.message;
          } else {
            errorMsg = String(error);
          }
          result.errors.push({ file: entryPath, error: errorMsg });
          this.logger.withError(error).warn(`Failed to extract ${entryPath}`);
        }
      }

      this.logger.info(
        `Extraction complete: ${result.extractedFiles.length} files extracted, ${result.skippedFiles.length} skipped, ${result.errors.length} errors`,
      );

      return result;
    } catch (error) {
      this.logUnrarError(error, "Failed to extract RAR archive");
      throw error;
    }
  }

  async extractFileStream(
    archivePath: string,
    filePath: string,
  ): Promise<StreamExtractionResult> {
    try {
      const data = await this.readArchiveBuffer(archivePath);
      const entries = await this.listEntriesFromData(data, archivePath);
      const entry = entries.find((e) => e.path === filePath);

      if (!entry) {
        throw new ExtractionError(`File ${filePath} not found in archive`);
      }

      const extractor = await createExtractorFromData({ data });
      const extracted = extractor.extract({ files: [filePath] });

      let file: ReturnType<typeof extracted.files.next>["value"];
      for (const f of extracted.files) {
        file = f;
        break;
      }

      if (!file?.extraction) {
        throw new ExtractionError(
          `Failed to extract ${filePath} from RAR archive`,
        );
      }

      const extraction = file.extraction;
      const stream = new Readable({
        read() {
          this.push(Buffer.from(extraction));
          this.push(null);
        },
      });

      return {
        stream,
        entry,
      };
    } catch (error) {
      this.logUnrarError(
        error,
        `Failed to extract file stream for ${filePath}`,
      );
      throw error;
    }
  }

  async extractFiles(
    archivePath: string,
    filePaths: string[],
    targetDir: string,
  ): Promise<ExtractionResult> {
    const result: ExtractionResult = {
      extractedFiles: [],
      skippedFiles: [],
      errors: [],
      totalBytes: 0,
    };

    try {
      const data = await this.readArchiveBuffer(archivePath);
      const entries = await this.listEntriesFromData(data, archivePath);

      const extractor = await createExtractorFromData({ data });
      const extracted = extractor.extract({ files: filePaths });

      for (const file of extracted.files) {
        try {
          const filePath = file.fileHeader.name;
          const entry = entries.find((e) => e.path === filePath);

          if (!entry) {
            result.errors.push({
              file: filePath,
              error: "File not found in archive",
            });
            continue;
          }

          if (!file.extraction) {
            result.errors.push({
              file: filePath,
              error: "Failed to extract file data",
            });
            continue;
          }

          const targetPath = this.getSafeFilePath(
            targetDir,
            basename(filePath),
          );
          const writeStream = await this.createSafeWriteStream(targetPath);

          const extraction = file.extraction;
          const readableStream = new Readable({
            read() {
              this.push(Buffer.from(extraction));
              this.push(null);
            },
          });

          await pipeline(readableStream, writeStream);

          result.extractedFiles.push(filePath);
          result.totalBytes += entry.size;

          this.logger.debug(`Extracted ${filePath} to ${targetPath}`);
        } catch (error) {
          const filePath = file.fileHeader?.name || "unknown";
          let errorMsg: string;
          if (error instanceof UnrarError) {
            errorMsg = `${error.reason}${error.file ? ` (file: ${error.file})` : ""}`;
          } else if (error instanceof Error) {
            errorMsg = error.message;
          } else {
            errorMsg = String(error);
          }
          result.errors.push({ file: filePath, error: errorMsg });
          this.logger.withError(error).warn(`Failed to extract ${filePath}`);
        }
      }

      return result;
    } catch (error) {
      this.logUnrarError(error, "Failed to extract specific files from RAR");
      throw error;
    }
  }

  async validateArchive(archivePath: string): Promise<boolean> {
    try {
      await this.listEntries(archivePath);
      return true;
    } catch (error) {
      if (error instanceof UnrarError) {
        this.logger
          .withError(error)
          .warn(
            `RAR validation failed for ${archivePath}: ${error.reason} ${error.file ? `(file: ${error.file})` : ""}`,
          );
      } else {
        this.logger
          .withError(error)
          .warn(`RAR validation failed for ${archivePath}`);
      }
      return false;
    }
  }

  private logUnrarError(error: unknown, message: string): void {
    if (error instanceof UnrarError) {
      this.logger
        .withError(error)
        .error(
          `${message}: ${error.reason} ${error.file ? `(file: ${error.file})` : ""}`,
        );
    } else {
      this.logger.withError(error).error(message);
    }
  }
}

export const rarExtractor = RarExtractor.getInstance();
