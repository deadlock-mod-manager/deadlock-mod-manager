import { db, sql } from "@deadlock-mods/database";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import type {
  DbHealth,
  DiscordHealth,
  HealthResponse,
  RedisHealth,
} from "@/types/health";
import { version } from "@/version";
import client from "../lib/discord";

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
      logger.withError(error as Error).error("DB health check failed");
      return { alive: false, error: (error as Error).message };
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
      logger.withError(error as Error).error("Redis health check failed");
      return {
        alive: false,
        configured: true,
        error: (error as Error).message,
      };
    }
  }

  async checkDiscord(): Promise<DiscordHealth> {
    try {
      if (!client.isReady()) {
        return { alive: false, error: "Discord client not ready" };
      }

      return { alive: true };
    } catch (error) {
      logger.withError(error as Error).error("Discord health check failed");
      return { alive: false, error: (error as Error).message };
    }
  }

  private async performHealthChecks(): Promise<HealthResponse> {
    const [dbHealth, redisHealth, discordHealth] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkDiscord(),
    ]);

    const healthy = dbHealth.alive && redisHealth.alive && discordHealth.alive;

    return {
      status: healthy ? "ok" : "degraded",
      db: dbHealth,
      redis: redisHealth,
      discord: discordHealth,
      version,
    };
  }

  async check(): Promise<HealthResponse> {
    if (this.isStarting) {
      return {
        status: "degraded",
        db: { alive: false, error: "Starting up" },
        redis: { alive: false, configured: true, error: "Starting up" },
        discord: { alive: false, error: "Starting up" },
        version,
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
      logger.withError(error as Error).error("Health check failed");

      if (this.cachedHealth) {
        return this.cachedHealth;
      }

      return {
        status: "degraded",
        db: { alive: false, error: "Health check error" },
        redis: { alive: false, configured: true, error: "Health check error" },
        discord: { alive: false, error: "Health check error" },
        version,
      };
    }
  }
}
