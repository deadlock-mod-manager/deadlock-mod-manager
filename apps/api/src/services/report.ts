import type { Mod, Report } from "@deadlock-mods/database";
import { type NewReportEvent, REDIS_CHANNELS } from "@deadlock-mods/shared";
import { logger, wideEventContext } from "@/lib/logger";
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
    const wide = wideEventContext.get();
    wide?.merge({
      reportService: "publishNewReport",
      reportId: report.id,
      reportChannel: REDIS_CHANNELS.NEW_REPORTS,
    });

    try {
      const event: NewReportEvent = {
        type: "new_report",
        data: {
          id: report.id,
          modId: report.modId,
          modName: mod.name,
          modAuthor: mod.author,
          createdAt: report.createdAt?.toISOString() || undefined,
        },
      };

      await redisPublisher.publish(
        REDIS_CHANNELS.NEW_REPORTS,
        JSON.stringify(event),
      );
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          reportId: report.id,
          modId: report.modId,
        })
        .error("Failed to publish new report event");
      throw error;
    }
  }
}

export const reportService = ReportService.getInstance();
