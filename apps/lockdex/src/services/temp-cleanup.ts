import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "@deadlock-mods/logging";
import { logger } from "@/lib/logger";
import { getTempDir } from "@/lib/temp-dir";

export interface CleanupConfig {
  maxAgeMs: number;

  patterns: string[];

  cleanupOnStartup: boolean;

  cleanupOnShutdown: boolean;

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
        maxAgeMs: 60 * 60 * 1000,
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

    if (this.config.cleanupOnShutdown) {
      process.on("SIGINT", () => this.gracefulShutdown());
      process.on("SIGTERM", () => this.gracefulShutdown());
      process.on("beforeExit", () => this.gracefulShutdown());
    }
  }

  async cleanupOldTempDirectories(): Promise<CleanupResult> {
    const result: CleanupResult = {
      cleanedDirectories: 0,
      freedBytes: 0,
      errors: [],
    };

    try {
      const tempDir = await getTempDir();
      const entries = await readdir(tempDir);

      for (const entry of entries) {
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

                const dirSize = await this.calculateDirectorySize(fullPath);
                await rm(fullPath, { recursive: true, force: true });
                result.cleanedDirectories++;
                result.freedBytes += dirSize;

                this.logger.debug(`Cleaned up: ${entry}`);
              }
            }
          } catch (error) {
            result.errors.push({
              path: fullPath,
              error: (error as Error)?.message || "Unknown error",
            });
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

  async cleanupAllTempDirectories(): Promise<CleanupResult> {
    this.logger.info("Performing startup cleanup of ALL temp directories");

    const result: CleanupResult = {
      cleanedDirectories: 0,
      freedBytes: 0,
      errors: [],
    };

    try {
      const tempDir = await getTempDir();
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

              const dirSize = await this.calculateDirectorySize(fullPath);
              await rm(fullPath, { recursive: true, force: true });
              result.cleanedDirectories++;
              result.freedBytes += dirSize;
            }
          } catch (error) {
            result.errors.push({
              path: fullPath,
              error: (error as Error)?.message || "Unknown error",
            });
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

  async emergencyCleanup(): Promise<CleanupResult> {
    this.logger.warn("Performing emergency temp directory cleanup");

    const result: CleanupResult = {
      cleanedDirectories: 0,
      freedBytes: 0,
      errors: [],
    };

    try {
      const tempDir = await getTempDir();
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

              const dirSize = await this.calculateDirectorySize(fullPath);
              await rm(fullPath, { recursive: true, force: true });
              result.cleanedDirectories++;
              result.freedBytes += dirSize;
            }
          } catch (error) {
            result.errors.push({
              path: fullPath,
              error: (error as Error)?.message || "Unknown error",
            });
            this.logger
              .withError(error)
              .warn(`Failed emergency cleanup: ${entry}`);
          }
        } else {
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

  private matchesPattern(name: string): boolean {
    return this.config.patterns.some((pattern) => {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return regex.test(name);
    });
  }

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
      return 0;
    }
  }

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
