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
import { HostedSourcesService } from "@/services/hosted-sources";

const logger = mainLogger.child().withContext({
  job: "hosted-sources",
});

export class HostedSourcesProcessor extends BaseProcessor<CronJobData> {
  private static instance: HostedSourcesProcessor | null = null;
  static readonly monitorSlug = MonitorSlug.HOSTED_SOURCES;
  static readonly cronPattern = CronPatterns.EVERY_15_MINUTES;

  private constructor() {
    super(logger);
  }

  static getInstance(): HostedSourcesProcessor {
    HostedSourcesProcessor.instance ??= new HostedSourcesProcessor();
    return HostedSourcesProcessor.instance;
  }

  async process(jobData: CronJobData) {
    const checkInId = Sentry.captureCheckIn(
      {
        monitorSlug: HostedSourcesProcessor.monitorSlug,
        status: "in_progress",
      },
      {
        schedule: {
          type: "crontab",
          value: toStandardCronPattern(HostedSourcesProcessor.cronPattern),
        },
        checkinMargin: 2,
        maxRuntime: 10,
        timezone: SERVER_TIMEZONE,
      },
    );

    const wide = createWideEvent(logger, "hosted_sources_refresh", {
      checkInId,
      monitorSlug: HostedSourcesProcessor.monitorSlug,
    });

    return wideEventContext.run(wide, async () => {
      try {
        const outcomes = await HostedSourcesService.getInstance().refreshAll();
        wide.merge({ outcomes });
        const failed = Object.keys(outcomes).filter(
          (id) => outcomes[id] === "failed",
        );
        if (failed.length > 0) {
          throw new RuntimeError(
            `Hosted source refresh failed: ${failed.join(", ")}`,
          );
        }
        wide.emit();
        Sentry.captureCheckIn({
          checkInId,
          monitorSlug: HostedSourcesProcessor.monitorSlug,
          status: "ok",
        });
        return super.handleSuccess(jobData);
      } catch (error) {
        wide.emit("error", error);
        Sentry.captureCheckIn({
          checkInId,
          monitorSlug: HostedSourcesProcessor.monitorSlug,
          status: "error",
        });
        return super.handleError(
          error instanceof Error ? error : new RuntimeError(String(error)),
        );
      }
    });
  }
}
