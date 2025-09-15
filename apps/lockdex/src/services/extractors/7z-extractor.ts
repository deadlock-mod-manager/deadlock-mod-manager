import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import * as _7z from '7zip-min';
import type {
  ArchiveEntry,
  ExtractionOptions,
  ExtractionResult,
  StreamExtractionResult,
} from '@/types/archive';
import { ArchiveExtractor } from '../archive';

interface SevenZipListItem {
  name: string;
  date: string;
  time: string;
  attr: string;
  size: string;
  compressed: string;
  crc: string;
  method: string;
  encrypted?: string;
  block?: string;
}

export class SevenZipExtractor extends ArchiveExtractor {
  getSupportedExtensions(): string[] {
    return ['.7z', '.zip', '.tar', '.gz', '.bz2', '.xz'];
  }

  async listEntries(archivePath: string): Promise<ArchiveEntry[]> {
    try {
      const files = (await _7z.list(archivePath)) as SevenZipListItem[];

      const entries: ArchiveEntry[] = files.map((file) => ({
        path: file.name,
        size: Number.parseInt(file.size, 10) || 0,
        isDirectory: file.attr?.includes('D') || file.name.endsWith('/'),
        modifiedAt:
          file.date && file.time
            ? new Date(`${file.date} ${file.time}`)
            : undefined,
        compressionRatio:
          file.compressed && file.size
            ? 1 -
              Number.parseInt(file.compressed, 10) /
                Number.parseInt(file.size, 10)
            : 0,
      }));

      this.logger.info(
        `Listed ${entries.length} entries from ${basename(archivePath)}`
      );
      return entries;
    } catch (error) {
      this.logger.withError(error).error('Failed to list 7z entries');
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

      if (filteredEntries.length === 0) {
        return result;
      }

      await this.ensureDirectory(options.targetDir);

      try {
        await _7z.unpack(archivePath, options.targetDir);

        for (const entry of filteredEntries) {
          if (entry.isDirectory) {
            continue;
          }

          const targetPath = this.getSafeFilePath(
            options.targetDir,
            options.preservePaths ? entry.path : basename(entry.path)
          );

          try {
            await stat(targetPath);
            result.extractedFiles.push(entry.path);
            result.totalBytes += entry.size;
            this.logger.debug(`Extracted ${entry.path} to ${targetPath}`);
          } catch {
            result.skippedFiles.push(entry.path);
          }
        }
      } catch (error) {
        for (const entry of filteredEntries) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          result.errors.push({ file: entry.path, error: errorMsg });
        }
      }

      this.logger.info(
        `Extraction complete: ${result.extractedFiles.length} files extracted, ${result.skippedFiles.length} skipped, ${result.errors.length} errors`
      );

      return result;
    } catch (error) {
      this.logger.withError(error).error('Failed to extract 7z archive');
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

      const tempDir = await this.createTempDir('7z-stream-');

      try {
        await _7z.unpack(archivePath, tempDir.path);

        const extractedPath = this.getSafeFilePath(tempDir.path, filePath);
        const fileBuffer = await readFile(extractedPath);

        const stream = new Readable({
          read() {
            this.push(fileBuffer);
            this.push(null);
          },
        });

        let cleaned = false;
        const originalDestroy = stream.destroy.bind(stream);
        stream.destroy = (error) => {
          if (!cleaned) {
            cleaned = true;
            tempDir.cleanup().catch(() => {
              // Ignore cleanup errors
            });
          }
          return originalDestroy(error);
        };

        stream.on('end', () => {
          if (!cleaned) {
            cleaned = true;
            tempDir.cleanup().catch(() => {
              // Ignore cleanup errors
            });
          }
        });

        return {
          stream,
          entry,
        };
      } catch (error) {
        await tempDir.cleanup();
        throw error;
      }
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
    targetDir: string
  ): Promise<ExtractionResult> {
    const result: ExtractionResult = {
      extractedFiles: [],
      skippedFiles: [],
      errors: [],
      totalBytes: 0,
    };

    try {
      const entries = await this.listEntries(archivePath);
      await this.ensureDirectory(targetDir);

      const tempDir = await this.createTempDir('7z-partial-');

      try {
        await _7z.unpack(archivePath, tempDir.path);

        for (const filePath of filePaths) {
          try {
            const entry = entries.find((e) => e.path === filePath);
            if (!entry) {
              result.errors.push({
                file: filePath,
                error: 'File not found in archive',
              });
              continue;
            }

            const sourcePath = this.getSafeFilePath(tempDir.path, filePath);
            const targetPath = this.getSafeFilePath(
              targetDir,
              basename(filePath)
            );

            try {
              await stat(sourcePath);
              const fileData = await readFile(sourcePath);
              const writeStream = await this.createSafeWriteStream(targetPath);
              writeStream.write(fileData);
              writeStream.end();

              result.extractedFiles.push(filePath);
              result.totalBytes += entry.size;

              this.logger.debug(`Extracted ${filePath} to ${targetPath}`);
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              result.errors.push({ file: filePath, error: errorMsg });
              this.logger
                .withError(error)
                .warn(`Failed to extract ${filePath}`);
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            result.errors.push({ file: filePath, error: errorMsg });
            this.logger.withError(error).warn(`Failed to extract ${filePath}`);
          }
        }

        await tempDir.cleanup();
      } catch (error) {
        await tempDir.cleanup();
        throw error;
      }

      return result;
    } catch (error) {
      this.logger
        .withError(error)
        .error('Failed to extract specific files from 7z');
      throw error;
    }
  }

  async validateArchive(archivePath: string): Promise<boolean> {
    try {
      await this.listEntries(archivePath);
      return true;
    } catch (error) {
      this.logger
        .withError(error)
        .warn(`7z validation failed for ${archivePath}`);
      return false;
    }
  }
}
