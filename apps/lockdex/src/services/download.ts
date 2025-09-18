import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Logger } from '@deadlock-mods/logging';
import { logger } from '@/lib/logger';

export interface DownloadOptions {
  /**
   * Timeout in milliseconds (default: 5 minutes)
   */
  timeout?: number;

  /**
   * Maximum file size in bytes (default: 500MB)
   */
  maxFileSize?: number;

  /**
   * Progress callback interval in bytes (default: 1MB)
   */
  progressInterval?: number;

  /**
   * Custom filename (default: extracted from URL)
   */
  filename?: string;

  /**
   * Custom temporary directory (default: auto-generated)
   */
  tempDir?: string;

  /**
   * Number of retry attempts (default: 3)
   */
  retryAttempts?: number;

  /**
   * Delay between retries in milliseconds (default: 1000)
   */
  retryDelay?: number;
}

export interface DownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  percentage: number;
  speed: number; // bytes per second
  estimatedTimeRemaining: number; // seconds
}

export interface DownloadResult {
  filePath: string;
  tempDir: string;
  size: number;
  duration: number;
  cleanup: () => Promise<void>;
  [Symbol.asyncDispose]: () => Promise<void>;
}

export class DownloadService {
  private static instance: DownloadService | null = null;
  private logger: Logger;

  private constructor(logger: Logger) {
    this.logger = logger.child().withContext({
      service: 'DownloadService',
    });
  }

  static getInstance(logger: Logger): DownloadService {
    if (!DownloadService.instance) {
      DownloadService.instance = new DownloadService(logger);
    }
    return DownloadService.instance;
  }

  /**
   * Download a file from URL with progress tracking and error handling
   */
  async downloadFile(
    url: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const {
      timeout = 5 * 60 * 1000,
      maxFileSize = 256 * 1024 * 1024,
      progressInterval = 1024 * 1024,
      filename = this.extractFilenameFromUrl(url),
      tempDir = await this.createTempDir(),
      retryAttempts = 3,
      retryDelay = 1000,
    } = options;

    const filePath = join(tempDir, filename);
    let lastAttempt: Error | null = null;

    this.logger.info(`Starting download from: ${url}`);
    this.logger.info(`Target file: ${filename}`);
    this.logger.info(`Temp directory: ${tempDir}`);

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        if (attempt > 1) {
          this.logger.info(`Retry attempt ${attempt}/${retryAttempts}`);
          await this.delay(retryDelay);
        }

        const startTime = Date.now();
        const result = await this.performDownload(url, filePath, {
          timeout,
          maxFileSize,
          progressInterval,
        });

        const duration = Date.now() - startTime;

        this.logger.info(`Download completed successfully in ${duration}ms`);

        const cleanup = () => this.cleanup(tempDir);

        return {
          filePath,
          tempDir,
          size: result.size,
          duration,
          cleanup,
          [Symbol.asyncDispose]: cleanup,
        };
      } catch (error) {
        lastAttempt = error as Error;
        this.logger.warn(
          `Download attempt ${attempt} failed: ${lastAttempt.message}`
        );

        try {
          await rm(filePath, { force: true });
        } catch {
          // Ignore cleanup errors
        }

        if (attempt === retryAttempts) {
          break;
        }
      }
    }

    await this.cleanup(tempDir);
    throw new Error(
      `Download failed after ${retryAttempts} attempts. Last error: ${lastAttempt?.message}`
    );
  }

  /**
   * Perform the actual download with progress tracking using streaming
   */
  private async performDownload(
    url: string,
    filePath: string,
    options: {
      timeout: number;
      maxFileSize: number;
      progressInterval: number;
    }
  ): Promise<{ size: number }> {
    const { timeout, maxFileSize, progressInterval } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? Number.parseInt(contentLength, 10) : 0;

      if (totalBytes > maxFileSize) {
        throw new Error(
          `File size (${totalBytes} bytes) exceeds maximum allowed size (${maxFileSize} bytes)`
        );
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      this.logger.info(
        `Content length: ${totalBytes > 0 ? `${(totalBytes / 1024 / 1024).toFixed(2)} MB` : 'unknown'}`
      );

      await mkdir(join(filePath, '..'), { recursive: true });

      let downloadedBytes = 0;
      let lastProgressUpdate = 0;
      const startTime = Date.now();

      const writeStream = createWriteStream(filePath);
      const progressTransform = new Transform({
        transform: (chunk: Buffer, _encoding, callback) => {
          downloadedBytes += chunk.length;

          if (downloadedBytes > maxFileSize) {
            const error = new Error(
              `Downloaded size exceeds maximum allowed size (${maxFileSize} bytes)`
            );
            callback(error);
            return;
          }

          if (
            downloadedBytes - lastProgressUpdate >= progressInterval ||
            downloadedBytes === totalBytes
          ) {
            this.logProgress(downloadedBytes, totalBytes, startTime);
            lastProgressUpdate = downloadedBytes;
          }

          callback(null, chunk);
        },
      });

      const reader = response.body.getReader();
      const nodeReadableStream = new Readable({
        async read() {
          try {
            const { done, value } = await reader.read();
            if (done) {
              this.push(null);
            } else {
              this.push(Buffer.from(value));
            }
          } catch (error) {
            this.destroy(error as Error);
          }
        },
      });

      await pipeline(nodeReadableStream, progressTransform, writeStream);

      const fileStats = await stat(filePath);
      this.logger.info(`File written successfully: ${fileStats.size} bytes`);

      return { size: fileStats.size };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Log download progress
   */
  private logProgress(
    downloadedBytes: number,
    totalBytes: number,
    startTime: number
  ): void {
    const elapsed = (Date.now() - startTime) / 1000; // seconds
    const speed = downloadedBytes / elapsed; // bytes per second
    const speedMBps = (speed / 1024 / 1024).toFixed(2);

    if (totalBytes > 0) {
      const percentage = (downloadedBytes / totalBytes) * 100;
      const remaining = (totalBytes - downloadedBytes) / speed;

      this.logger.info(
        `Progress: ${percentage.toFixed(1)}% ` +
          `(${(downloadedBytes / 1024 / 1024).toFixed(2)}/${(totalBytes / 1024 / 1024).toFixed(2)} MB) ` +
          `Speed: ${speedMBps} MB/s ` +
          `ETA: ${remaining > 0 ? Math.ceil(remaining) : 0}s`
      );
    } else {
      this.logger.info(
        `Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB ` +
          `Speed: ${speedMBps} MB/s`
      );
    }
  }

  /**
   * Extract filename from URL
   */
  private extractFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = basename(pathname);

      if (filename?.includes('.')) {
        return filename;
      }

      const timestamp = Date.now();
      return `download-${timestamp}.bin`;
    } catch {
      // Invalid URL, generate a filename
      const timestamp = Date.now();
      return `download-${timestamp}.bin`;
    }
  }

  /**
   * Create a temporary directory for downloads
   */
  private async createTempDir(): Promise<string> {
    const tempDirPath = await mkdtemp(join(tmpdir(), 'mod-download-'));
    this.logger.debug(`Created temporary directory: ${tempDirPath}`);
    return tempDirPath;
  }

  /**
   * Clean up temporary directory
   */
  private async cleanup(tempDir: string): Promise<void> {
    try {
      await rm(tempDir, { recursive: true, force: true });
      this.logger.debug(`Cleaned up temporary directory: ${tempDir}`);
    } catch (error) {
      this.logger
        .withError(error)
        .warn(`Failed to cleanup temporary directory: ${tempDir}`);
    }
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Download multiple files concurrently
   */
  async downloadFiles(
    downloads: Array<{ url: string; options?: DownloadOptions }>,
    concurrency = 3
  ): Promise<DownloadResult[]> {
    this.logger.info(
      `Starting batch download of ${downloads.length} files (concurrency: ${concurrency})`
    );

    const results: DownloadResult[] = [];
    const errors: Error[] = [];

    // Process downloads in batches
    for (let i = 0; i < downloads.length; i += concurrency) {
      const batch = downloads.slice(i, i + concurrency);

      const batchPromises = batch.map(async ({ url, options }) => {
        try {
          return await this.downloadFile(url, options);
        } catch (error) {
          errors.push(error as Error);
          throw error;
        }
      });

      try {
        const batchResults = await Promise.allSettled(batchPromises);

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          }
        }
      } catch (error) {
        this.logger.withError(error).error('Batch download failed');
      }
    }

    this.logger.info(
      `Batch download completed: ${results.length} successful, ${errors.length} failed`
    );

    if (errors.length > 0) {
      this.logger.error(
        `Download errors: ${errors.map((e) => e.message).join(', ')}`
      );
    }

    return results;
  }
}

export const downloadService = DownloadService.getInstance(logger);
