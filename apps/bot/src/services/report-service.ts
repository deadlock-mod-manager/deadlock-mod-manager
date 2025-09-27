import type { Mod, Report } from "@deadlock-mods/database";
import {
  REDIS_CHANNELS,
  type ReportStatusUpdatedEvent,
} from "@deadlock-mods/shared";
import IORedis from "ioredis";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "report-service",
});

export class ReportService {
  private static instance: ReportService | null = null;
  private redisPublisher: IORedis;

  private constructor() {
    this.redisPublisher = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });

    this.redisPublisher.on("error", (error) => {
      logger.withError(error).error("Redis publisher error");
    });

    this.redisPublisher.on("connect", () => {
      logger.debug("Redis publisher connected");
    });
  }

  static getInstance(): ReportService {
    if (!ReportService.instance) {
      ReportService.instance = new ReportService();
    }
    return ReportService.instance;
  }

  async publishReportStatusUpdatedEvent(
    report: Report,
    mod: Mod,
  ): Promise<void> {
    try {
      const event: ReportStatusUpdatedEvent = {
        type: "report_status_updated",
        data: {
          id: report.id,
          modId: report.modId,
          modName: mod.name,
          modAuthor: mod.author,
          type: report.type,
          status: report.status,
          reason: report.reason,
          description: report.description || undefined,
          verifiedBy: report.verifiedBy || undefined,
          dismissedBy: report.dismissedBy || undefined,
          dismissalReason: report.dismissalReason || undefined,
          createdAt: report.createdAt?.toISOString() || undefined,
        },
      };

      await this.redisPublisher.publish(
        REDIS_CHANNELS.REPORT_STATUS_UPDATED,
        JSON.stringify(event),
      );

      logger
        .withMetadata({
          reportId: report.id,
          modId: report.modId,
          modName: mod.name,
          status: report.status,
          channel: REDIS_CHANNELS.REPORT_STATUS_UPDATED,
        })
        .info("Published report status updated event to Redis");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          reportId: report.id,
          modId: report.modId,
          status: report.status,
        })
        .error("Failed to publish report status updated event");
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.redisPublisher.quit();
      logger.info("Redis publisher disconnected");
    } catch (error) {
      logger.withError(error).error("Error disconnecting Redis publisher");
    }
  }
}
