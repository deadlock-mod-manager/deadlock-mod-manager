import { toErrorMessage } from "@deadlock-mods/common";
import { db, sql } from "@deadlock-mods/database";
import { logger } from "@/lib/logger";
import type { DbHealth, HealthResponse } from "@/types/health";
import { version } from "@/version";

const CACHE_TTL_MS = 2000;

export class HealthService {
  private static singleton: HealthService;
  private cachedHealth: HealthResponse | null = null;
  private cacheTimestamp = 0;

  static getInstance(): HealthService {
    if (!HealthService.singleton) {
      HealthService.singleton = new HealthService();
    }
    return HealthService.singleton;
  }

  private async checkDb(): Promise<DbHealth> {
    try {
      await db.execute(sql`select 1`);
      return { alive: true };
    } catch (error) {
      logger.withError(error).error("DB health check failed");
      return { alive: false, error: toErrorMessage(error) };
    }
  }

  async check(): Promise<HealthResponse> {
    const now = Date.now();
    if (this.cachedHealth && now - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedHealth;
    }

    const dbHealth = await this.checkDb();
    const health: HealthResponse = {
      status: dbHealth.alive ? "ok" : "degraded",
      db: dbHealth,
      redis: { alive: false, configured: false },
      s3: { alive: false, configured: false },
      version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    this.cachedHealth = health;
    this.cacheTimestamp = now;
    return health;
  }
}
