import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Logger } from "@deadlock-mods/logging";
import { logger } from "@/lib/logger";

export interface CleanupConfig {
  /**
   * Maximum age for temp directories in milliseconds (default: 1 hour)
   */
  maxAgeMs: number;

  /**
   * Directories to clean up (default: mod-download-*, archive-extract-*, 7z-stream-*, 7z-partial-*)
   */
  patterns: string[];

  /**
   * Whether to clean up on startup (default: true)
   */
  cleanupOnStartup: boolean;

  /**
   * Whether to clean up on shutdown (default: true)
   */
  cleanupOnShutdown: boolean;

  /**
   * Whether to clean up ALL temp dirs on startup (default: true)
   * When true, ignores age and cleans up all matching directories
   */
  cleanupAllOnStartup: boolean;
}

export interface CleanupResult {
  cleanedDirectories: number;
  freedBytes: number;
  errors: Array<{ path: string; error: string }>;
}

export class TempCleanupService {
  private static instance: TempCleanupService | null = null;
  private logger: Logger;
  private config: CleanupConfig;
  private isShuttingDown = false;

  private constructor(logger: Logger, config: CleanupConfig) {
    this.logger = logger.child().withContext({
      service: "TempCleanupService",
    });
    this.config = config;
  }

  static getInstance(
    logger: Logger,
    config?: Partial<CleanupConfig>,
  ): TempCleanupService {
    if (!TempCleanupService.instance) {
      const defaultConfig: CleanupConfig = {
        maxAgeMs: 60 * 60 * 1000, // 1 hour
        patterns: [
          "mod-download-*",
          "archive-extract-*",
          "7z-stream-*",
          "7z-partial-*",
        ],
        cleanupOnStartup: true,
        cleanupOnShutdown: true,
        cleanupAllOnStartup: true,
        ...config,
      };
      TempCleanupService.instance = new TempCleanupService(
        logger,
        defaultConfig,
      );
    }
    return TempCleanupService.instance;
  }

  /**
   * Initialize cleanup service
   */
  async initialize(): Promise<void> {
    if (this.config.cleanupOnStartup) {
      if (this.config.cleanupAllOnStartup) {
        this.logger.info("Starting initial cleanup of ALL temp directories");
        await this.cleanupAllTempDirectories();
      } else {
        this.logger.info("Starting initial temp directory cleanup");
        await this.cleanupOldTempDirectories();
      }
    }

    // Set up graceful shutdown
    if (this.config.cleanupOnShutdown) {
      process.on("SIGINT", () => this.gracefulShutdown());
      process.on("SIGTERM", () => this.gracefulShutdown());
      process.on("beforeExit", () => this.gracefulShutdown());
    }
  }

  /**
   * Clean up old temporary directories
   */
  async cleanupOldTempDirectories(): Promise<CleanupResult> {
    const result: CleanupResult = {
      cleanedDirectories: 0,
      freedBytes: 0,
      errors: [],
    };

    try {
      const tempDir = tmpdir();
      const entries = await readdir(tempDir);

      for (const entry of entries) {
        // Check if entry matches any of our patterns
        if (this.matchesPattern(entry)) {
          const fullPath = join(tempDir, entry);

          try {
            const stats = await stat(fullPath);

            if (stats.isDirectory()) {
              const age = Date.now() - stats.mtime.getTime();

              if (age > this.config.maxAgeMs) {
                this.logger.info(
                  `Cleaning up old temp directory: ${entry} (age: ${Math.round(age / 1000)}s)`,
                );

                await rm(fullPath, { recursive: true, force: true });
                result.cleanedDirectories++;
                result.freedBytes +=
                  await this.calculateDirectorySize(fullPath);

                this.logger.debug(`Cleaned up: ${entry}`);
              }
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            result.errors.push({ path: fullPath, error: errorMsg });
            this.logger
              .withError(error)
              .warn(`Failed to clean up temp directory: ${entry}`);
          }
        }
      }

      this.logger.info(
        `Cleanup completed: ${result.cleanedDirectories} directories cleaned, ` +
          `${(result.freedBytes / 1024 / 1024).toFixed(2)} MB freed`,
      );

      if (result.errors.length > 0) {
        this.logger.warn(`${result.errors.length} cleanup errors occurred`);
      }

      return result;
    } catch (error) {
      this.logger.withError(error).error("Failed to cleanup temp directories");
      throw error;
    }
  }

  /**
   * Clean up ALL temp directories (startup cleanup)
   */
  async cleanupAllTempDirectories(): Promise<CleanupResult> {
    this.logger.info("Performing startup cleanup of ALL temp directories");

    const result: CleanupResult = {
      cleanedDirectories: 0,
      freedBytes: 0,
      errors: [],
    };

    try {
      const tempDir = tmpdir();
      this.logger.info(`Scanning temp directory: ${tempDir}`);
      const entries = await readdir(tempDir);
      this.logger.info(`Found ${entries.length} entries in temp directory`);

      for (const entry of entries) {
        if (this.matchesPattern(entry)) {
          const fullPath = join(tempDir, entry);

          try {
            const stats = await stat(fullPath);

            if (stats.isDirectory()) {
              this.logger.info(`Startup cleanup: ${entry}`);

              await rm(fullPath, { recursive: true, force: true });
              result.cleanedDirectories++;
              result.freedBytes += await this.calculateDirectorySize(fullPath);
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            result.errors.push({ path: fullPath, error: errorMsg });
            this.logger
              .withError(error)
              .warn(`Failed startup cleanup: ${entry}`);
          }
        }
      }

      this.logger.info(
        `Startup cleanup completed: ${result.cleanedDirectories} directories cleaned, ` +
          `${(result.freedBytes / 1024 / 1024).toFixed(2)} MB freed`,
      );

      return result;
    } catch (error) {
      this.logger.withError(error).error("Startup cleanup failed");
      throw error;
    }
  }

  /**
   * Force cleanup all temp directories (emergency cleanup)
   */
  async emergencyCleanup(): Promise<CleanupResult> {
    this.logger.warn("Performing emergency temp directory cleanup");

    const result: CleanupResult = {
      cleanedDirectories: 0,
      freedBytes: 0,
      errors: [],
    };

    try {
      const tempDir = tmpdir();
      this.logger.info(`Emergency cleanup scanning: ${tempDir}`);
      const entries = await readdir(tempDir);
      this.logger.info(`Emergency cleanup found ${entries.length} entries`);

      for (const entry of entries) {
        if (this.matchesPattern(entry)) {
          const fullPath = join(tempDir, entry);

          try {
            const stats = await stat(fullPath);

            if (stats.isDirectory()) {
              this.logger.info(`Emergency cleanup: ${entry}`);

              await rm(fullPath, { recursive: true, force: true });
              result.cleanedDirectories++;
              result.freedBytes += await this.calculateDirectorySize(fullPath);
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            result.errors.push({ path: fullPath, error: errorMsg });
            this.logger
              .withError(error)
              .warn(`Failed emergency cleanup: ${entry}`);
          }
        } else {
          // Log entries that don't match patterns for diagnostic purposes
          this.logger.debug(`Skipping non-matching entry: ${entry}`);
        }
      }

      this.logger.warn(
        `Emergency cleanup completed: ${result.cleanedDirectories} directories cleaned, ` +
          `${(result.freedBytes / 1024 / 1024).toFixed(2)} MB freed`,
      );

      return result;
    } catch (error) {
      this.logger.withError(error).error("Emergency cleanup failed");
      throw error;
    }
  }

  /**
   * Check if a directory name matches any cleanup pattern
   */
  private matchesPattern(name: string): boolean {
    return this.config.patterns.some((pattern) => {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return regex.test(name);
    });
  }

  /**
   * Calculate directory size recursively
   */
  private async calculateDirectorySize(dirPath: string): Promise<number> {
    try {
      const entries = await readdir(dirPath);
      let totalSize = 0;

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          totalSize += await this.calculateDirectorySize(fullPath);
        } else {
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch {
      // If we can't calculate size, return 0
      return 0;
    }
  }

  /**
   * Graceful shutdown cleanup
   */
  private async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info("Graceful shutdown: cleaning up temp directories");

    try {
      await this.cleanupOldTempDirectories();
    } catch (error) {
      this.logger
        .withError(error)
        .error("Error during graceful shutdown cleanup");
    }
  }
}

export const tempCleanupService = TempCleanupService.getInstance(logger);
