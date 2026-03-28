import type { Mod, Report } from "@deadlock-mods/database";
import {
  REDIS_CHANNELS,
  type ReportStatusUpdatedEvent,
} from "@deadlock-mods/shared";
import IORedis from "ioredis";
import { singleton } from "tsyringe";
import { env } from "@/lib/env";
import { logger, wideEventContext } from "@/lib/logger";

@singleton()
export class ReportEventPublisherService {
  private readonly redisPublisher: IORedis;

  constructor() {
    this.redisPublisher = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });

    this.redisPublisher.on("error", (error) => {
      logger.withError(error).error("Redis publisher error");
    });

    this.redisPublisher.on("connect", () => {
      logger.info("Redis publisher connected");
    });
  }

  async publishReportStatusUpdatedEvent(
    report: Report,
    mod: Mod,
  ): Promise<void> {
    const wide = wideEventContext.get();
    wide?.merge({
      service: "report-event-publisher",
      reportId: report.id,
      modId: report.modId,
      modName: mod.name,
      status: report.status,
      channel: REDIS_CHANNELS.REPORT_STATUS_UPDATED,
    });

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

      wide?.merge({ redisPublishOutcome: "published" });
    } catch (error) {
      wide?.merge({ redisPublishOutcome: "failed" });
      throw error;
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
