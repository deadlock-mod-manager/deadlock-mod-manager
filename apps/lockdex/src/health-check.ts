import { logger } from "@/lib/logger";
import redis from "@/lib/redis";
import { diskHealthMonitor } from "@/services/disk-health-monitor";

export async function healthCheck(): Promise<{
  status: "healthy" | "unhealthy";
  checks: {
    redis: { status: "healthy" | "unhealthy"; message: string };
    disk: {
      status: "healthy" | "unhealthy";
      message: string;
      details?: unknown;
    };
  };
}> {
  const checks = {
    redis: { status: "healthy" as "healthy" | "unhealthy", message: "OK" },
    disk: {
      status: "healthy" as "healthy" | "unhealthy",
      message: "OK",
      details: undefined as unknown,
    },
  };

  // Check Redis connection
  try {
    await redis.ping();
  } catch (error) {
    checks.redis = {
      status: "unhealthy",
      message: `Redis ping failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Check Redis read/write
  try {
    const testKey = "health-check";
    const testValue = Date.now().toString();
    await redis.set(testKey, testValue, "EX", 10);
    const retrievedValue = await redis.get(testKey);
    if (retrievedValue !== testValue) {
      throw new Error("Redis read/write test failed");
    }
    await redis.del(testKey);
  } catch (error) {
    checks.redis = {
      status: "unhealthy",
      message: `Redis read/write test failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Check disk health
  try {
    const diskStatus = await diskHealthMonitor.getHealthStatus();
    if (!diskStatus.isHealthy) {
      checks.disk = {
        status: "unhealthy",
        message: `Disk space critical: ${diskStatus.diskSpace.usagePercentage.toFixed(1)}% used`,
        details: {
          usagePercentage: diskStatus.diskSpace.usagePercentage,
          freeBytes: diskStatus.diskSpace.freeBytes,
          recommendations: diskStatus.recommendations,
        },
      };
    } else if (diskStatus.recommendations.length > 0) {
      checks.disk = {
        status: "healthy",
        message: `Disk space OK but recommendations: ${diskStatus.recommendations.join(", ")}`,
        details: {
          usagePercentage: diskStatus.diskSpace.usagePercentage,
          freeBytes: diskStatus.diskSpace.freeBytes,
          recommendations: diskStatus.recommendations,
        },
      };
    }
  } catch (error) {
    checks.disk = {
      status: "unhealthy",
      message: `Disk health check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: undefined,
    };
  }

  const overallStatus =
    checks.redis.status === "healthy" && checks.disk.status === "healthy"
      ? "healthy"
      : "unhealthy";

  return {
    status: overallStatus,
    checks,
  };
}

// Legacy health check function for backward compatibility
export async function legacyHealthCheck(): Promise<void> {
  try {
    await redis.ping();
  } catch (error) {
    logger.withError(error as Error).error("Health check failed");
    throw new Error("Redis ping failed", { cause: error });
  }

  try {
    const testKey = "health-check";
    const testValue = Date.now().toString();
    await redis.set(testKey, testValue, "EX", 10);
    const retrievedValue = await redis.get(testKey);
    if (retrievedValue !== testValue) {
      throw new Error("Redis read/write test failed");
    }
    await redis.del(testKey);
  } catch (error) {
    logger.withError(error as Error).error("Health check failed");
    throw new Error("Redis read/write test failed", { cause: error });
  }
}
