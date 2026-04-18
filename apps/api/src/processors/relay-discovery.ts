import { BaseProcessor, type CronJobData } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import * as Sentry from "@sentry/node";
import { MonitorSlug, SERVER_TIMEZONE } from "@/lib/constants";
import {
  createWideEvent,
  logger as mainLogger,
  wideEventContext,
} from "@/lib/logger";
import { RelayDiscoveryService } from "@/services/relay-discovery";

const logger = mainLogger.child().withContext({
  job: "relay-discovery",
});

export class RelayDiscoveryProcessor extends BaseProcessor<CronJobData> {
  private static instance: RelayDiscoveryProcessor | null = null;
  static readonly monitorSlug = MonitorSlug.RELAY_DISCOVERY;
  static readonly cronPattern = CronPatterns.EVERY_5_MINUTES;

  private constructor() {
    super(logger);
  }

  static getInstance(): RelayDiscoveryProcessor {
    if (!RelayDiscoveryProcessor.instance) {
      RelayDiscoveryProcessor.instance = new RelayDiscoveryProcessor();
    }
    return RelayDiscoveryProcessor.instance;
  }

  async process(jobData: CronJobData) {
    const checkInId = Sentry.captureCheckIn(
      {
        monitorSlug: RelayDiscoveryProcessor.monitorSlug,
        status: "in_progress",
      },
      {
        schedule: {
          type: "crontab",
          value: RelayDiscoveryProcessor.cronPattern,
        },
        checkinMargin: 1,
        maxRuntime: 5,
        timezone: SERVER_TIMEZONE,
      },
    );

    const wide = createWideEvent(logger, "relay_manifest_refresh", {
      checkInId,
      monitorSlug: RelayDiscoveryProcessor.monitorSlug,
    });

    return wideEventContext.run(wide, async () => {
      try {
        const service = RelayDiscoveryService.getInstance();
        const relays = await service.refreshManifest();
        wide.merge({ relayCount: relays.length });
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
      monitorSlug: RelayDiscoveryProcessor.monitorSlug,
      status: "ok",
    });
    return super.handleSuccess(jobData);
  }

  protected handleJobError(error: Error, checkInId: string) {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: RelayDiscoveryProcessor.monitorSlug,
      status: "error",
    });
    return super.handleError(error);
  }
}
