import { db, sql } from "@deadlock-mods/database";
import { injectable } from "tsyringe";
import { version } from "@/version";
import { logger } from "../lib/logger";
import type { DbHealth, HealthResponse } from "../types/health";

@injectable()
export class HealthService {
  async checkDb(): Promise<DbHealth> {
    try {
      await db.execute(sql`select 1`);
      return { alive: true };
    } catch (error) {
      logger.withError(error as Error).error("DB health check failed");
      return { alive: false, error: (error as Error).message };
    }
  }

  async check(): Promise<HealthResponse> {
    const [dbHealth] = await Promise.all([this.checkDb()]);

    const healthy = dbHealth.alive;

    return {
      status: healthy ? "ok" : "degraded",
      db: dbHealth,
      version,
    };
  }
}
