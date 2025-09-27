import { BaseProcessor, type CronJobData } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import * as Sentry from "@sentry/bun";
import { MonitorSlug, SERVER_TIMEZONE } from "@/lib/constants";
import { logger as mainLogger } from "@/lib/logger";
import { GameBananaRssService } from "@/services/gamebanana-rss";

const logger = mainLogger.child().withContext({
  job: "gamebanana-rss-processor",
});

export class GamebananaRssProcessor extends BaseProcessor<CronJobData> {
  private static instance: GamebananaRssProcessor | null = null;
  static readonly monitorSlug = MonitorSlug.GAMEBANANA_RSS;
  static readonly cronPattern = CronPatterns.EVERY_5_MINUTES;

  private constructor() {
    super(logger);
  }

  static getInstance(): GamebananaRssProcessor {
    if (!GamebananaRssProcessor.instance) {
      GamebananaRssProcessor.instance = new GamebananaRssProcessor();
    }
    return GamebananaRssProcessor.instance;
  }

  async process(jobData: CronJobData) {
    const checkInId = Sentry.captureCheckIn(
      {
        monitorSlug: GamebananaRssProcessor.monitorSlug,
        status: "in_progress",
      },
      {
        schedule: {
          type: "crontab",
          value: GamebananaRssProcessor.cronPattern,
        },
        checkinMargin: 1,
        maxRuntime: 10,
        timezone: SERVER_TIMEZONE,
      },
    );
    const result = await GameBananaRssService.getInstance().processRssFeed();

    if (result.isErr()) {
      logger
        .withError(result.error)
        .error("Error processing gamebanana rss job");
      return this.handleJobError(result.error, checkInId);
    }

    return this.handleJobSuccess(jobData, checkInId);
  }

  protected handleJobSuccess(jobData: CronJobData, checkInId: string) {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: GamebananaRssProcessor.monitorSlug,
      status: "ok",
    });
    return super.handleSuccess(jobData);
  }

  protected handleJobError(error: Error, checkInId: string) {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: GamebananaRssProcessor.monitorSlug,
      status: "error",
    });
    return super.handleError(error);
  }
}
