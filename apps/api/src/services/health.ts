import { toErrorMessage } from "@deadlock-mods/common";
import { db, sql } from "@deadlock-mods/database";
import { version } from "@/version";
import { logger } from "../lib/logger";
import { redis } from "../lib/redis";
import type { DbHealth, HealthResponse, RedisHealth } from "../types/health";

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

  async check(): Promise<HealthResponse> {
    const [dbHealth, redisHealth] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const healthy = dbHealth.alive && redisHealth.alive;

    return {
      status: healthy ? "ok" : "degraded",
      db: dbHealth,
      redis: redisHealth,
      version,
      spec: "/docs/openapi.json",
    };
  }
}
