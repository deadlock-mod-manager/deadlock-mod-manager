import { BaseProcessor, type CronJobData } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import * as Sentry from "@sentry/node";
import { MonitorSlug, SERVER_TIMEZONE } from "@/lib/constants";
import {
  createWideEvent,
  logger as mainLogger,
  wideEventContext,
} from "@/lib/logger";
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

    const wide = createWideEvent(logger, "scheduled_mod_sync", {
      checkInId,
      monitorSlug: ModsSyncProcessor.monitorSlug,
    });

    return wideEventContext.run(wide, async () => {
      try {
        const syncService = ModSyncService.getInstance();
        const result = await syncService.synchronizeMods({
          checkInId,
          monitorSlug: ModsSyncProcessor.monitorSlug,
        });

        wide.merge({ success: result.success, resultMessage: result.message });
        wide.emit();

        return this.handleJobSuccess(jobData, checkInId);
      } catch (error) {
        wide.emit("error", error);
        return this.handleJobError(
          error instanceof Error ? error : new Error(String(error)),
          checkInId,
        );
      }
    });
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
