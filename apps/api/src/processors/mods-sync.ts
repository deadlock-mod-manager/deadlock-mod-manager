import { BaseProcessor, type CronJobData } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import * as Sentry from "@sentry/node";
import { MonitorSlug, SERVER_TIMEZONE } from "@/lib/constants";
import { logger as mainLogger } from "@/lib/logger";
import { ModSyncService } from "@/services/mod-sync";

const logger = mainLogger.child().withContext({
  job: "synchronize-mods",
});

export class ModsSyncProcessor extends BaseProcessor<CronJobData> {
  private static instance: ModsSyncProcessor | null = null;
  static readonly monitorSlug = MonitorSlug.MODS_SYNCHRONIZATION;
  static readonly cronPattern = CronPatterns.EVERY_HOUR;

  private constructor() {
    super(logger);
  }

  static getInstance(): ModsSyncProcessor {
    if (!ModsSyncProcessor.instance) {
      ModsSyncProcessor.instance = new ModsSyncProcessor();
    }
    return ModsSyncProcessor.instance;
  }

  async process(jobData: CronJobData) {
    const checkInId = Sentry.captureCheckIn(
      {
        monitorSlug: ModsSyncProcessor.monitorSlug,
        status: "in_progress",
      },
      {
        schedule: {
          type: "crontab",
          value: ModsSyncProcessor.cronPattern,
        },
        checkinMargin: 1,
        maxRuntime: 10,
        timezone: SERVER_TIMEZONE,
      },
    );

    try {
      logger.info(
        `Starting scheduled mod synchronization at ${new Date().toISOString()}`,
      );
      const syncService = ModSyncService.getInstance();
      const result = await syncService.synchronizeMods({
        checkInId,
        monitorSlug: ModsSyncProcessor.monitorSlug,
      });

      if (result.success) {
        logger.info("Scheduled mod synchronization completed successfully");
      } else {
        logger.warn(`Scheduled mod synchronization result: ${result.message}`);
      }
      return this.handleJobSuccess(jobData, checkInId);
    } catch (error) {
      logger.withError(error).error("Error processing mods scheduler job");
      return this.handleJobError(error as Error, checkInId);
    }
  }

  protected handleJobSuccess(jobData: CronJobData, checkInId: string) {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: ModsSyncProcessor.monitorSlug,
      status: "ok",
    });
    return super.handleSuccess(jobData);
  }

  protected handleJobError(error: Error, checkInId: string) {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: ModsSyncProcessor.monitorSlug,
      status: "error",
    });
    return super.handleError(error);
  }
}
