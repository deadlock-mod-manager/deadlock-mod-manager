import { statfs } from "node:fs/promises";
import { RuntimeError } from "@deadlock-mods/common";
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
  warningThreshold: number;

  criticalThreshold: number;

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
        criticalThreshold: 98,
        minFreeBytes: 1024 * 1024 * 1024,
        ...config,
      };
      DiskSpaceMonitor.instance = new DiskSpaceMonitor(logger, defaultConfig);
    }
    return DiskSpaceMonitor.instance;
  }

  async checkDiskSpace(): Promise<DiskSpaceInfo> {
    try {
      const tempDir = await getTempDir();
      this.logger.debug(`Checking disk space for: ${tempDir}`);

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

  async hasSpaceForFile(fileSizeBytes: number): Promise<boolean> {
    const diskInfo = await this.checkDiskSpace();

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
      throw new RuntimeError(
        `Disk space measurement unavailable for ${path}`,
        error,
      );
    }
  }
}

export const diskSpaceMonitor = DiskSpaceMonitor.getInstance(logger);
