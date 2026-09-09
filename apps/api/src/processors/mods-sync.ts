import { RuntimeError } from "@deadlock-mods/common";
import { BaseProcessor, type CronJobData } from "@deadlock-mods/queue";
import { CronPatterns, toStandardCronPattern } from "@deadlock-mods/queue/cron";
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
  static readonly cronPattern = CronPatterns.EVERY_2_HOURS;

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
          value: toStandardCronPattern(ModsSyncProcessor.cronPattern),
        },
        checkinMargin: 5,
        // A full GameBanana sweep is ~7.8k mods at ~90/min, so the run needs
        // most of the two hour window before it counts as hung
        maxRuntime: 110,
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
        const result = await syncService.synchronizeMods();

        wide.merge({ success: result.success, resultMessage: result.message });

        if (result.success) {
          wide.emit("success");
          return this.handleJobSuccess(jobData, checkInId);
        }

        // The schedule leaves a wide margin over a normal run, so a lock still
        // held by the previous run means it overran or wedged. Report it to
        // Sentry, but succeed the job: retrying would only hit the same lock.
        wide.emit("error");
        this.reportCheckIn(checkInId, "error");

        if (result.locked) {
          logger.warn(
            "Mod sync skipped, the previous run still holds the lock",
          );
          return super.handleSuccess(jobData);
        }

        return super.handleError(new RuntimeError(result.message));
      } catch (error) {
        wide.emit("error", error);
        return this.handleJobError(
          error instanceof Error ? error : new RuntimeError(String(error)),
          checkInId,
        );
      }
    });
  }

  private reportCheckIn(checkInId: string, status: "ok" | "error") {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: ModsSyncProcessor.monitorSlug,
      status,
    });
  }

  protected handleJobSuccess(jobData: CronJobData, checkInId: string) {
    this.reportCheckIn(checkInId, "ok");
    return super.handleSuccess(jobData);
  }

  protected handleJobError(error: Error, checkInId: string) {
    this.reportCheckIn(checkInId, "error");
    return super.handleError(error);
  }
}
