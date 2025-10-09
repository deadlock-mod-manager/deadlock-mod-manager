import { logger } from "@/lib/logger";
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

      if (this.config.logDiskInfo) {
        this.logger.info(
          `Disk health check: ${diskInfo.usagePercentage.toFixed(1)}% used, ` +
            `${(diskInfo.freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB free`,
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
