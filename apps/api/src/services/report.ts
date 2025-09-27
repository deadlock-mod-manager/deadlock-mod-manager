import type { Mod, Report } from "@deadlock-mods/database";
import {
  type NewReportEvent,
  REDIS_CHANNELS,
  type ReportStatusUpdatedEvent,
} from "@deadlock-mods/shared";
import { logger } from "@/lib/logger";
import { redisPublisher } from "@/lib/redis";

export class ReportService {
  private static instance: ReportService | null = null;

  static getInstance(): ReportService {
    if (!ReportService.instance) {
      ReportService.instance = new ReportService();
    }
    return ReportService.instance;
  }

  async publishNewReportEvent(report: Report, mod: Mod): Promise<void> {
    try {
      const event: NewReportEvent = {
        type: "new_report",
        data: {
          id: report.id,
          modId: report.modId,
          modName: mod.name,
          modAuthor: mod.author,
          type: report.type,
          status: report.status,
          reason: report.reason,
          description: report.description || undefined,
          createdAt: report.createdAt?.toISOString() || undefined,
        },
      };

      await redisPublisher.publish(
        REDIS_CHANNELS.NEW_REPORTS,
        JSON.stringify(event),
      );

      logger
        .withMetadata({
          reportId: report.id,
          modId: report.modId,
          modName: mod.name,
          channel: REDIS_CHANNELS.NEW_REPORTS,
        })
        .info("Published new report event to Redis");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          reportId: report.id,
          modId: report.modId,
        })
        .error("Failed to publish new report event");
    }
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

      await redisPublisher.publish(
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
}

export const reportService = ReportService.getInstance();
