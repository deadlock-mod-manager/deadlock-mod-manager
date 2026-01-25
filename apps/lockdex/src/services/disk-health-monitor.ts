import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@/lib/logger";
import { getTempDir } from "@/lib/temp-dir";
import { diskSpaceMonitor } from "@/services/disk-space-monitor";
import { tempCleanupService } from "@/services/temp-cleanup";

export interface HealthCheckConfig {
  /**
   * Interval between health checks in milliseconds (default: 5 minutes)
   */
  checkIntervalMs: number;

  /**
   * Whether to perform cleanup during health checks (default: true)
   */
  performCleanup: boolean;

  /**
   * Whether to log disk space info on each check (default: false)
   */
  logDiskInfo: boolean;
}

export class DiskHealthMonitor {
  private static instance: DiskHealthMonitor | null = null;
  private logger = logger.child().withContext({ service: "DiskHealthMonitor" });
  private config: HealthCheckConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  private constructor(config: HealthCheckConfig) {
    this.config = config;
  }

  static getInstance(config?: Partial<HealthCheckConfig>): DiskHealthMonitor {
    if (!DiskHealthMonitor.instance) {
      const defaultConfig: HealthCheckConfig = {
        checkIntervalMs: 5 * 60 * 1000, // 5 minutes
        performCleanup: true,
        logDiskInfo: false,
        ...config,
      };
      DiskHealthMonitor.instance = new DiskHealthMonitor(defaultConfig);
    }
    return DiskHealthMonitor.instance;
  }

  /**
   * Start the health monitoring service
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn("Disk health monitor is already running");
      return;
    }

    this.logger.info("Starting disk health monitor");
    this.isRunning = true;

    // Perform initial check
    this.performHealthCheck();

    // Set up periodic checks
    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the health monitoring service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info("Stopping disk health monitor");
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Perform a single health check
   */
  async performHealthCheck(): Promise<void> {
    try {
      const diskInfo = await diskSpaceMonitor.checkDiskSpace();
      const tempDirInfo = await this.checkTempDirectories();

      if (this.config.logDiskInfo) {
        this.logger.info(
          `Disk health check: ${diskInfo.usagePercentage.toFixed(1)}% used, ` +
            `${(diskInfo.freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB free, ` +
            `temp dirs: ${tempDirInfo.count} (${tempDirInfo.totalSizeMB.toFixed(2)} MB)`,
        );
      }

      if (tempDirInfo.count > 50) {
        this.logger.warn(
          `High number of temp directories detected: ${tempDirInfo.count}`,
        );
      }

      if (tempDirInfo.totalSizeMB > 1024) {
        this.logger.warn(
          `Temp directories consuming significant space: ${tempDirInfo.totalSizeMB.toFixed(2)} MB`,
        );
      }

      // Perform cleanup if configured and disk usage is high
      if (this.config.performCleanup && diskInfo.isLowSpace) {
        this.logger.warn("Low disk space detected, performing cleanup");
        const cleanupResult =
          await tempCleanupService.cleanupOldTempDirectories();

        if (cleanupResult.cleanedDirectories > 0) {
          this.logger.info(
            `Cleanup freed ${(cleanupResult.freedBytes / 1024 / 1024).toFixed(2)} MB ` +
              `by removing ${cleanupResult.cleanedDirectories} directories`,
          );
        }
      }
    } catch (error) {
      this.logger.withError(error).error("Disk health check failed");
    }
  }

  /**
   * Check temp directories for potential issues
   */
  private async checkTempDirectories(): Promise<{
    count: number;
    totalSizeMB: number;
    patterns: Record<string, number>;
  }> {
    const patterns = {
      "mod-download-": 0,
      "archive-extract-": 0,
      "7z-stream-": 0,
      "7z-partial-": 0,
    };

    let totalSize = 0;
    let count = 0;

    try {
      const tempDir = await getTempDir();
      const entries = await readdir(tempDir);

      for (const entry of entries) {
        for (const pattern of Object.keys(patterns) as Array<
          keyof typeof patterns
        >) {
          if (entry.startsWith(pattern)) {
            const fullPath = join(tempDir, entry);
            try {
              const stats = await stat(fullPath);
              if (stats.isDirectory()) {
                count++;
                patterns[pattern]++;
                totalSize += await this.calculateDirectorySize(fullPath);
              }
            } catch {
              // Ignore errors for individual directories
            }
            break;
          }
        }
      }
    } catch (error) {
      this.logger.withError(error).warn("Failed to check temp directories");
    }

    return {
      count,
      totalSizeMB: totalSize / 1024 / 1024,
      patterns,
    };
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
      return 0;
    }
  }

  /**
   * Get current health status
   */
  async getHealthStatus(): Promise<{
    diskSpace: Awaited<ReturnType<typeof diskSpaceMonitor.checkDiskSpace>>;
    isHealthy: boolean;
    recommendations: string[];
  }> {
    const diskSpace = await diskSpaceMonitor.checkDiskSpace();
    const recommendations: string[] = [];

    if (diskSpace.isLowSpace) {
      recommendations.push("Disk space is critically low - consider cleanup");
    } else if (diskSpace.usagePercentage > 80) {
      recommendations.push("Disk usage is high - monitor closely");
    }

    if (diskSpace.freeBytes < 2 * 1024 * 1024 * 1024) {
      // Less than 2GB
      recommendations.push("Free space is below 2GB - cleanup recommended");
    }

    return {
      diskSpace,
      isHealthy: !diskSpace.isLowSpace,
      recommendations,
    };
  }
}

export const diskHealthMonitor = DiskHealthMonitor.getInstance();
