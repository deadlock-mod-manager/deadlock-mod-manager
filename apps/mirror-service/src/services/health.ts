import { toErrorMessage } from "@deadlock-mods/common";
import { db, sql } from "@deadlock-mods/database";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { S3Service } from "@/services/s3";
import type {
  DbHealth,
  HealthResponse,
  RedisHealth,
  S3Health,
} from "@/types/health";
import { version } from "@/version";

const HEALTH_CHECK_SENTINEL_KEY = "__health_check__";

export class HealthService {
  private static singleton: HealthService;
  private cachedHealth: HealthResponse | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 2000;
  private isStarting = true;

  static getInstance(): HealthService {
    if (!HealthService.singleton) {
      HealthService.singleton = new HealthService();
    }
    return HealthService.singleton;
  }

  markAsReady(): void {
    this.isStarting = false;
    logger.info("Health service marked as ready");
  }

  async checkDb(): Promise<DbHealth> {
    try {
      await db.execute(sql`select 1`);
      return { alive: true };
    } catch (error) {
      logger.withError(error).error("DB health check failed");
      return { alive: false, error: toErrorMessage(error) };
    }
  }

  async checkRedis(): Promise<RedisHealth> {
    try {
      const pong = await redis.ping();
      if (pong !== "PONG") {
        throw new Error("Redis ping failed");
      }
      return { alive: true, configured: true };
    } catch (error) {
      logger.withError(error).error("Redis health check failed");
      return {
        alive: false,
        configured: true,
        error: toErrorMessage(error),
      };
    }
  }

  async checkS3(): Promise<S3Health> {
    try {
      const result = await S3Service.instance.fileExists(
        HEALTH_CHECK_SENTINEL_KEY,
      );
      if (result.isErr()) {
        throw result.error;
      }
      return { alive: true };
    } catch (error) {
      logger.withError(error).error("S3 health check failed");
      return {
        alive: false,
        error: toErrorMessage(error),
      };
    }
  }

  private async performHealthChecks(): Promise<HealthResponse> {
    const [dbHealth, redisHealth, s3Health] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkS3(),
    ]);

    const healthy = dbHealth.alive && redisHealth.alive && s3Health.alive;

    return {
      status: healthy ? "ok" : "degraded",
      db: dbHealth,
      redis: redisHealth,
      s3: s3Health,
      version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  async check(): Promise<HealthResponse> {
    if (this.isStarting) {
      return {
        status: "degraded",
        db: { alive: false, error: "Starting up" },
        redis: { alive: false, configured: true, error: "Starting up" },
        s3: { alive: false, error: "Starting up" },
        version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
    }

    const now = Date.now();
    const cacheAge = now - this.cacheTimestamp;

    if (this.cachedHealth && cacheAge < this.CACHE_TTL_MS) {
      return this.cachedHealth;
    }

    try {
      const health = await this.performHealthChecks();
      this.cachedHealth = health;
      this.cacheTimestamp = now;
      return health;
    } catch (error) {
      logger.withError(error).error("Health check failed");

      if (this.cachedHealth) {
        return this.cachedHealth;
      }

      return {
        status: "degraded",
        db: { alive: false, error: "Health check error" },
        redis: { alive: false, configured: true, error: "Health check error" },
        s3: { alive: false, error: "Health check error" },
        version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
    }
  }
}
