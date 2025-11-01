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

  static getInstance(): HealthService {
    if (!HealthService.singleton) {
      HealthService.singleton = new HealthService();
    }
    return HealthService.singleton;
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

  async check(): Promise<HealthResponse> {
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
}
