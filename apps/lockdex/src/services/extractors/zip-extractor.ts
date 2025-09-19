import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { pipeline } from "node:stream/promises";
import * as yauzl from "yauzl";
import { logger } from "@/lib/logger";
import type {
  ArchiveEntry,
  ExtractionOptions,
  ExtractionResult,
  StreamExtractionResult,
} from "@/types/archive";
import { ArchiveExtractor } from "../archive";

export class ZipExtractor extends ArchiveExtractor {
  private static instance: ZipExtractor | null = null;

  private constructor() {
    super(logger);
  }

  static getInstance(): ZipExtractor {
    if (!ZipExtractor.instance) {
      ZipExtractor.instance = new ZipExtractor();
    }
    return ZipExtractor.instance;
  }

  getSupportedExtensions(): string[] {
    return [".zip"];
  }

  async listEntries(archivePath: string): Promise<ArchiveEntry[]> {
    try {
      const entries: ArchiveEntry[] = [];

      return new Promise((resolve, reject) => {
        yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            reject(err);
            return;
          }

          if (!zipfile) {
            reject(new Error("Failed to open ZIP file"));
            return;
          }

          zipfile.readEntry();

          zipfile.on("entry", (entry: yauzl.Entry) => {
            const isDirectory = entry.fileName.endsWith("/");

            entries.push({
              path: entry.fileName,
              size: entry.uncompressedSize,
              isDirectory,
              modifiedAt: entry.getLastModDate(),
              compressionRatio:
                entry.compressedSize > 0
                  ? 1 - entry.compressedSize / entry.uncompressedSize
                  : 0,
            });

            zipfile.readEntry();
          });

          zipfile.on("end", () => {
            this.logger.info(
              `Listed ${entries.length} entries from ${basename(archivePath)}`,
            );
            resolve(entries);
          });

          zipfile.on("error", (error) => {
            reject(error);
          });
        });
      });
    } catch (error) {
      this.logger.withError(error).error("Failed to list ZIP entries");
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
      const entries = await this.listEntries(archivePath);
      const filteredEntries = this.filterEntries(entries, options);

      if (filteredEntries.length === 0) {
        return result;
      }

      await this.ensureDirectory(options.targetDir);

      return new Promise((resolve, reject) => {
        yauzl.open(archivePath, { lazyEntries: true }, async (err, zipfile) => {
          if (err) {
            reject(err);
            return;
          }

          if (!zipfile) {
            reject(new Error("Failed to open ZIP file"));
            return;
          }

          const entryMap = new Map(filteredEntries.map((e) => [e.path, e]));
          let processedCount = 0;

          zipfile.readEntry();

          zipfile.on("entry", async (entry: yauzl.Entry) => {
            try {
              const archiveEntry = entryMap.get(entry.fileName);

              if (!archiveEntry) {
                zipfile.readEntry();
                return;
              }

              if (entry.fileName.endsWith("/")) {
                if (options.preservePaths) {
                  const dirPath = this.getSafeFilePath(
                    options.targetDir,
                    entry.fileName,
                  );
                  await this.ensureDirectory(dirPath);
                }
                zipfile.readEntry();
                return;
              }

              const targetPath = this.getSafeFilePath(
                options.targetDir,
                options.preservePaths
                  ? entry.fileName
                  : basename(entry.fileName),
              );

              if (!options.overwrite) {
                try {
                  await stat(targetPath);
                  result.skippedFiles.push(entry.fileName);
                  zipfile.readEntry();
                  return;
                } catch {
                  // File doesn't exist, proceed with extraction
                }
              }

              zipfile.openReadStream(entry, async (err, readStream) => {
                try {
                  if (err) {
                    result.errors.push({
                      file: entry.fileName,
                      error: err.message,
                    });
                    zipfile.readEntry();
                    return;
                  }

                  if (!readStream) {
                    result.errors.push({
                      file: entry.fileName,
                      error: "Failed to open read stream",
                    });
                    zipfile.readEntry();
                    return;
                  }

                  const writeStream =
                    await this.createSafeWriteStream(targetPath);
                  await pipeline(readStream, writeStream);

                  result.extractedFiles.push(entry.fileName);
                  result.totalBytes += entry.uncompressedSize;

                  this.logger.debug(
                    `Extracted ${entry.fileName} to ${targetPath}`,
                  );
                } catch (error) {
                  const errorMsg =
                    error instanceof Error ? error.message : String(error);
                  result.errors.push({ file: entry.fileName, error: errorMsg });
                  this.logger
                    .withError(error)
                    .warn(`Failed to extract ${entry.fileName}`);
                } finally {
                  processedCount++;
                  if (
                    processedCount ===
                    filteredEntries.filter((e) => !e.isDirectory).length
                  ) {
                    this.logger.info(
                      `Extraction complete: ${result.extractedFiles.length} files extracted, ${result.skippedFiles.length} skipped, ${result.errors.length} errors`,
                    );
                    resolve(result);
                  } else {
                    zipfile.readEntry();
                  }
                }
              });
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              result.errors.push({ file: entry.fileName, error: errorMsg });
              this.logger
                .withError(error)
                .warn(`Failed to process ${entry.fileName}`);
              zipfile.readEntry();
            }
          });

          zipfile.on("end", () => {
            this.logger.info(
              `Extraction complete: ${result.extractedFiles.length} files extracted, ${result.skippedFiles.length} skipped, ${result.errors.length} errors`,
            );
            resolve(result);
          });

          zipfile.on("error", (error) => {
            reject(error);
          });
        });
      });
    } catch (error) {
      this.logger.withError(error).error("Failed to extract ZIP archive");
      throw error;
    }
  }

  async extractFileStream(
    archivePath: string,
    filePath: string,
  ): Promise<StreamExtractionResult> {
    try {
      const entries = await this.listEntries(archivePath);
      const entry = entries.find((e) => e.path === filePath);

      if (!entry) {
        throw new Error(`File ${filePath} not found in archive`);
      }

      return new Promise((resolve, reject) => {
        yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            reject(err);
            return;
          }

          if (!zipfile) {
            reject(new Error("Failed to open ZIP file"));
            return;
          }

          zipfile.readEntry();

          zipfile.on("entry", (zipEntry: yauzl.Entry) => {
            if (zipEntry.fileName === filePath) {
              if (zipEntry.fileName.endsWith("/")) {
                reject(new Error(`${filePath} is a directory, not a file`));
                return;
              }

              zipfile.openReadStream(zipEntry, (err, readStream) => {
                if (err) {
                  reject(err);
                  return;
                }

                if (!readStream) {
                  reject(
                    new Error(`Failed to open read stream for ${filePath}`),
                  );
                  return;
                }

                resolve({
                  stream: readStream,
                  entry,
                });
              });
            } else {
              zipfile.readEntry();
            }
          });

          zipfile.on("end", () => {
            reject(
              new Error(
                `File ${filePath} not found in archive during stream extraction`,
              ),
            );
          });

          zipfile.on("error", (error) => {
            reject(error);
          });
        });
      });
    } catch (error) {
      this.logger
        .withError(error)
        .error(`Failed to extract file stream for ${filePath}`);
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
      await this.ensureDirectory(targetDir);

      return new Promise((resolve, reject) => {
        yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            reject(err);
            return;
          }

          if (!zipfile) {
            reject(new Error("Failed to open ZIP file"));
            return;
          }

          const targetFiles = new Set(filePaths);
          let processedCount = 0;

          zipfile.readEntry();

          zipfile.on("entry", async (entry: yauzl.Entry) => {
            try {
              if (!targetFiles.has(entry.fileName)) {
                zipfile.readEntry();
                return;
              }

              if (entry.fileName.endsWith("/")) {
                zipfile.readEntry();
                return;
              }

              const targetPath = this.getSafeFilePath(
                targetDir,
                basename(entry.fileName),
              );

              zipfile.openReadStream(entry, async (err, readStream) => {
                try {
                  if (err) {
                    result.errors.push({
                      file: entry.fileName,
                      error: err.message,
                    });
                    processedCount++;
                    this.checkCompletion(
                      processedCount,
                      targetFiles.size,
                      result,
                      resolve,
                      zipfile,
                    );
                    return;
                  }

                  if (!readStream) {
                    result.errors.push({
                      file: entry.fileName,
                      error: "Failed to open read stream",
                    });
                    processedCount++;
                    this.checkCompletion(
                      processedCount,
                      targetFiles.size,
                      result,
                      resolve,
                      zipfile,
                    );
                    return;
                  }

                  const writeStream =
                    await this.createSafeWriteStream(targetPath);
                  await pipeline(readStream, writeStream);

                  result.extractedFiles.push(entry.fileName);
                  result.totalBytes += entry.uncompressedSize;

                  this.logger.debug(
                    `Extracted ${entry.fileName} to ${targetPath}`,
                  );
                } catch (error) {
                  const errorMsg =
                    error instanceof Error ? error.message : String(error);
                  result.errors.push({ file: entry.fileName, error: errorMsg });
                  this.logger
                    .withError(error)
                    .warn(`Failed to extract ${entry.fileName}`);
                } finally {
                  processedCount++;
                  this.checkCompletion(
                    processedCount,
                    targetFiles.size,
                    result,
                    resolve,
                    zipfile,
                  );
                }
              });
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              result.errors.push({ file: entry.fileName, error: errorMsg });
              this.logger
                .withError(error)
                .warn(`Failed to process ${entry.fileName}`);
              processedCount++;
              this.checkCompletion(
                processedCount,
                targetFiles.size,
                result,
                resolve,
                zipfile,
              );
            }
          });

          zipfile.on("end", () => {
            // Add errors for files that weren't found
            for (const filePath of filePaths) {
              const isExtracted = result.extractedFiles.includes(filePath);
              const hasError = result.errors.some((e) => e.file === filePath);

              if (isExtracted || hasError) {
                continue;
              }

              result.errors.push({
                file: filePath,
                error: "File not found in archive",
              });
            }
            resolve(result);
          });

          zipfile.on("error", (error) => {
            reject(error);
          });
        });
      });
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to extract specific files from ZIP");
      throw error;
    }
  }

  private checkCompletion(
    processedCount: number,
    totalFiles: number,
    result: ExtractionResult,
    resolve: (value: ExtractionResult) => void,
    zipfile: yauzl.ZipFile,
  ): void {
    if (processedCount >= totalFiles) {
      zipfile.close();
      resolve(result);
    } else {
      zipfile.readEntry();
    }
  }

  async validateArchive(archivePath: string): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        yauzl.open(
          archivePath,
          { lazyEntries: true, validateEntrySizes: true },
          (err, zipfile) => {
            if (err) {
              this.logger
                .withError(err)
                .warn(`ZIP validation failed for ${archivePath}`);
              resolve(false);
              return;
            }

            if (!zipfile) {
              this.logger.warn(
                `Failed to open ZIP file for validation: ${archivePath}`,
              );
              resolve(false);
              return;
            }

            let isValid = true;
            zipfile.readEntry();

            zipfile.on("entry", (entry: yauzl.Entry) => {
              // Basic validation - check if entry has valid properties
              if (
                !entry.fileName ||
                entry.uncompressedSize < 0 ||
                entry.compressedSize < 0
              ) {
                isValid = false;
                zipfile.close();
                resolve(false);
                return;
              }
              zipfile.readEntry();
            });

            zipfile.on("end", () => {
              resolve(isValid);
            });

            zipfile.on("error", (error) => {
              this.logger
                .withError(error)
                .warn(`ZIP validation error for ${archivePath}`);
              resolve(false);
            });
          },
        );
      });
    } catch (error) {
      this.logger
        .withError(error)
        .warn(`ZIP validation failed for ${archivePath}`);
      return false;
    }
  }
}

export const zipExtractor = ZipExtractor.getInstance();
