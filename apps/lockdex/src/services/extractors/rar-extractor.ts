import fs, { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createExtractorFromData, UnrarError } from 'node-unrar-js';

import type {
  ArchiveEntry,
  ExtractionOptions,
  ExtractionResult,
  StreamExtractionResult,
} from '@/types/archive';
import { ArchiveExtractor } from '../archive';

export class RarExtractor extends ArchiveExtractor {
  getSupportedExtensions(): string[] {
    return ['.rar'];
  }

  async listEntries(archivePath: string): Promise<ArchiveEntry[]> {
    try {
      const buffer = await fs.readFile(archivePath);
      const extractor = await createExtractorFromData({
        data: new Uint8Array(buffer).buffer,
      });

      const entries: ArchiveEntry[] = [];
      const list = extractor.getFileList();
      const fileHeaders = Array.from(list.fileHeaders);

      for (const header of fileHeaders) {
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
        `Listed ${entries.length} entries from ${basename(archivePath)}`
      );
      return entries;
    } catch (error) {
      if (error instanceof UnrarError) {
        this.logger
          .withError(error)
          .error(
            `Failed to list RAR entries: ${error.reason} ${error.file ? `(file: ${error.file})` : ''}`
          );
      } else {
        this.logger.withError(error).error('Failed to list RAR entries');
      }
      throw error;
    }
  }

  async extractAll(
    archivePath: string,
    options: ExtractionOptions
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

      const buffer = await fs.readFile(archivePath);
      const extractor = await createExtractorFromData({
        data: new Uint8Array(buffer).buffer,
      });

      const fileNamesToExtract = filteredEntries
        .filter((entry) => !entry.isDirectory)
        .map((entry) => entry.path);

      if (fileNamesToExtract.length === 0) {
        return result;
      }

      const extracted = extractor.extract({ files: fileNamesToExtract });
      const files = Array.from(extracted.files);

      for (const file of files) {
        try {
          const entry = filteredEntries.find(
            (e) => e.path === file.fileHeader.name
          );
          if (!entry) {
            continue;
          }

          if (entry.isDirectory) {
            if (options.preservePaths) {
              const dirPath = this.getSafeFilePath(
                options.targetDir,
                entry.path
              );
              await this.ensureDirectory(dirPath);
            }
            continue;
          }

          const targetPath = this.getSafeFilePath(
            options.targetDir,
            options.preservePaths ? entry.path : basename(entry.path)
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
          const entryPath = file.fileHeader?.name || 'unknown';
          let errorMsg: string;
          if (error instanceof UnrarError) {
            errorMsg = `${error.reason}${error.file ? ` (file: ${error.file})` : ''}`;
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
        `Extraction complete: ${result.extractedFiles.length} files extracted, ${result.skippedFiles.length} skipped, ${result.errors.length} errors`
      );

      return result;
    } catch (error) {
      if (error instanceof UnrarError) {
        this.logger
          .withError(error)
          .error(
            `Failed to extract RAR archive: ${error.reason} ${error.file ? `(file: ${error.file})` : ''}`
          );
      } else {
        this.logger.withError(error).error('Failed to extract RAR archive');
      }
      throw error;
    }
  }

  async extractFileStream(
    archivePath: string,
    filePath: string
  ): Promise<StreamExtractionResult> {
    try {
      const entries = await this.listEntries(archivePath);
      const entry = entries.find((e) => e.path === filePath);

      if (!entry) {
        throw new Error(`File ${filePath} not found in archive`);
      }

      const buffer = await fs.readFile(archivePath);
      const extractor = await createExtractorFromData({
        data: new Uint8Array(buffer).buffer,
      });

      const extracted = extractor.extract({ files: [filePath] });
      const files = Array.from(extracted.files);
      const file = files[0];

      if (!file?.extraction) {
        throw new Error(`Failed to extract ${filePath} from RAR archive`);
      }

      const stream = new Readable({
        read() {
          this.push(Buffer.from(file.extraction!));
          this.push(null);
        },
      });

      return {
        stream,
        entry,
      };
    } catch (error) {
      if (error instanceof UnrarError) {
        this.logger
          .withError(error)
          .error(
            `Failed to extract file stream for ${filePath}: ${error.reason} ${error.file ? `(file: ${error.file})` : ''}`
          );
      } else {
        this.logger
          .withError(error)
          .error(`Failed to extract file stream for ${filePath}`);
      }
      throw error;
    }
  }

  async extractFiles(
    archivePath: string,
    filePaths: string[],
    targetDir: string
  ): Promise<ExtractionResult> {
    const result: ExtractionResult = {
      extractedFiles: [],
      skippedFiles: [],
      errors: [],
      totalBytes: 0,
    };

    try {
      const buffer = await fs.readFile(archivePath);
      const extractor = await createExtractorFromData({
        data: new Uint8Array(buffer).buffer,
      });
      const entries = await this.listEntries(archivePath);

      const extracted = extractor.extract({ files: filePaths });
      const files = Array.from(extracted.files);

      for (const file of files) {
        try {
          const filePath = file.fileHeader.name;
          const entry = entries.find((e) => e.path === filePath);

          if (!entry) {
            result.errors.push({
              file: filePath,
              error: 'File not found in archive',
            });
            continue;
          }

          if (!file.extraction) {
            result.errors.push({
              file: filePath,
              error: 'Failed to extract file data',
            });
            continue;
          }

          const targetPath = this.getSafeFilePath(
            targetDir,
            basename(filePath)
          );
          const writeStream = await this.createSafeWriteStream(targetPath);

          const readableStream = new Readable({
            read() {
              this.push(Buffer.from(file.extraction!));
              this.push(null);
            },
          });

          await pipeline(readableStream, writeStream);

          result.extractedFiles.push(filePath);
          result.totalBytes += entry.size;

          this.logger.debug(`Extracted ${filePath} to ${targetPath}`);
        } catch (error) {
          const filePath = file.fileHeader?.name || 'unknown';
          let errorMsg: string;
          if (error instanceof UnrarError) {
            errorMsg = `${error.reason}${error.file ? ` (file: ${error.file})` : ''}`;
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
      if (error instanceof UnrarError) {
        this.logger
          .withError(error)
          .error(
            `Failed to extract specific files from RAR: ${error.reason} ${error.file ? `(file: ${error.file})` : ''}`
          );
      } else {
        this.logger
          .withError(error)
          .error('Failed to extract specific files from RAR');
      }
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
            `RAR validation failed for ${archivePath}: ${error.reason} ${error.file ? `(file: ${error.file})` : ''}`
          );
      } else {
        this.logger
          .withError(error)
          .warn(`RAR validation failed for ${archivePath}`);
      }
      return false;
    }
  }
}
