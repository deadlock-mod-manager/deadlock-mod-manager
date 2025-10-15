import { statfs } from "node:fs/promises";
import type { Logger } from "@deadlock-mods/logging";
import { logger } from "@/lib/logger";
import { getTempDir } from "@/lib/temp-dir";

export interface DiskSpaceInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usagePercentage: number;
  isLowSpace: boolean;
}

export interface DiskSpaceConfig {
  /**
   * Warning threshold percentage (default: 85%)
   */
  warningThreshold: number;

  /**
   * Critical threshold percentage (default: 95%)
   */
  criticalThreshold: number;

  /**
   * Minimum free space in bytes (default: 1GB)
   */
  minFreeBytes: number;
}

export class DiskSpaceMonitor {
  private static instance: DiskSpaceMonitor | null = null;
  private logger: Logger;
  private config: DiskSpaceConfig;

  private constructor(logger: Logger, config: DiskSpaceConfig) {
    this.logger = logger.child().withContext({
      service: "DiskSpaceMonitor",
    });
    this.config = config;
  }

  static getInstance(
    logger: Logger,
    config?: Partial<DiskSpaceConfig>,
  ): DiskSpaceMonitor {
    if (!DiskSpaceMonitor.instance) {
      const defaultConfig: DiskSpaceConfig = {
        warningThreshold: 85,
        criticalThreshold: 95,
        minFreeBytes: 1024 * 1024 * 1024, // 1GB
        ...config,
      };
      DiskSpaceMonitor.instance = new DiskSpaceMonitor(logger, defaultConfig);
    }
    return DiskSpaceMonitor.instance;
  }

  /**
   * Check disk space for the temp directory
   */
  async checkDiskSpace(): Promise<DiskSpaceInfo> {
    try {
      const tempDir = await getTempDir();
      this.logger.debug(`Checking disk space for: ${tempDir}`);

      // Get filesystem stats using statvfs equivalent
      const fsStats = await this.getFilesystemStats(tempDir);

      const usagePercentage = (fsStats.usedBytes / fsStats.totalBytes) * 100;
      const isLowSpace =
        usagePercentage >= this.config.criticalThreshold ||
        fsStats.freeBytes < this.config.minFreeBytes;

      const diskInfo: DiskSpaceInfo = {
        totalBytes: fsStats.totalBytes,
        freeBytes: fsStats.freeBytes,
        usedBytes: fsStats.usedBytes,
        usagePercentage,
        isLowSpace,
      };

      if (isLowSpace) {
        this.logger.error(
          `Critical disk space: ${usagePercentage.toFixed(1)}% used, ` +
            `${(fsStats.freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB free`,
        );
      } else if (usagePercentage >= this.config.warningThreshold) {
        this.logger.warn(
          `High disk usage: ${usagePercentage.toFixed(1)}% used, ` +
            `${(fsStats.freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB free`,
        );
      }

      return diskInfo;
    } catch (error) {
      this.logger.withError(error).error("Failed to check disk space");
      throw error;
    }
  }

  /**
   * Check if there's enough space for a file of given size
   */
  async hasSpaceForFile(fileSizeBytes: number): Promise<boolean> {
    const diskInfo = await this.checkDiskSpace();

    // Require at least 2x the file size as free space for safety
    const requiredSpace = fileSizeBytes * 2;

    return diskInfo.freeBytes >= requiredSpace && !diskInfo.isLowSpace;
  }

  private async getFilesystemStats(path: string): Promise<{
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
  }> {
    try {
      const stats = await statfs(path);

      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bfree * stats.bsize;
      const usedBytes = totalBytes - freeBytes;

      return {
        totalBytes,
        freeBytes,
        usedBytes,
      };
    } catch (error) {
      this.logger
        .withError(error)
        .warn("Failed to get disk space info, using fallback");

      // Fallback: return conservative estimates
      return {
        totalBytes: 100 * 1024 * 1024 * 1024, // 100GB fallback
        freeBytes: 10 * 1024 * 1024 * 1024, // 10GB fallback
        usedBytes: 90 * 1024 * 1024 * 1024, // 90GB fallback
      };
    }
  }
}

export const diskSpaceMonitor = DiskSpaceMonitor.getInstance(logger);
