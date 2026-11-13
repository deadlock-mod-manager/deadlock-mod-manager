import { RuntimeError } from "@deadlock-mods/common";
import { db, OAuthTokenRepository } from "@deadlock-mods/database";
import { BaseProcessor, type CronJobData } from "@deadlock-mods/queue";
import { CronPatterns, toStandardCronPattern } from "@deadlock-mods/queue/cron";
import * as Sentry from "@sentry/node";
import { MonitorSlug, SERVER_TIMEZONE } from "@/lib/constants";
import {
  createWideEvent,
  logger as mainLogger,
  wideEventContext,
} from "@/lib/logger";

const logger = mainLogger.child().withContext({
  job: "oauth-token-cleanup",
});

const oauthTokenRepository = new OAuthTokenRepository(db);

const BATCH_SIZE = 5000;
// Desktop refreshes create about 7k rows per table an hour. The cap spreads a
// backlog over several runs so one run can't burst WAL onto the replicas and
// the archive; later runs pick up the rest.
const MAX_BATCHES_PER_TABLE = 20;

const deleteInBatches = async (
  deleteBatch: (limit: number) => Promise<number>,
) => {
  let total = 0;
  for (let batch = 0; batch < MAX_BATCHES_PER_TABLE; batch++) {
    const deleted = await deleteBatch(BATCH_SIZE);
    total += deleted;
    if (deleted < BATCH_SIZE) break;
  }
  return total;
};

export class OAuthTokenCleanupProcessor extends BaseProcessor<CronJobData> {
  private static instance: OAuthTokenCleanupProcessor | null = null;
  static readonly monitorSlug = MonitorSlug.OAUTH_TOKEN_CLEANUP;
  static readonly cronPattern = CronPatterns.EVERY_HOUR;

  private constructor() {
    super(logger);
  }

  static getInstance(): OAuthTokenCleanupProcessor {
    if (!OAuthTokenCleanupProcessor.instance) {
      OAuthTokenCleanupProcessor.instance = new OAuthTokenCleanupProcessor();
    }
    return OAuthTokenCleanupProcessor.instance;
  }

  async process(jobData: CronJobData) {
    const checkInId = Sentry.captureCheckIn(
      {
        monitorSlug: OAuthTokenCleanupProcessor.monitorSlug,
        status: "in_progress",
      },
      {
        schedule: {
          type: "crontab",
          value: toStandardCronPattern(OAuthTokenCleanupProcessor.cronPattern),
        },
        checkinMargin: 5,
        maxRuntime: 30,
        timezone: SERVER_TIMEZONE,
      },
    );

    const wide = createWideEvent(logger, "oauth_token_cleanup", {
      checkInId,
      monitorSlug: OAuthTokenCleanupProcessor.monitorSlug,
    });

    return wideEventContext.run(wide, async () => {
      try {
        const cutoff = new Date();
        // Access tokens go first so the refresh token deletes cascade to fewer rows.
        const deletedAccessTokens = await deleteInBatches((limit) =>
          oauthTokenRepository.deleteExpiredAccessTokens(cutoff, limit),
        );
        wide.merge({ deletedAccessTokens });
        const deletedRefreshTokens = await deleteInBatches((limit) =>
          oauthTokenRepository.deleteExpiredRefreshTokens(cutoff, limit),
        );
        wide.merge({ deletedRefreshTokens });
        wide.emit();
        return this.handleJobSuccess(jobData, checkInId);
      } catch (error) {
        wide.emit("error", error);
        return this.handleJobError(
          error instanceof Error ? error : new RuntimeError(String(error)),
          checkInId,
        );
      }
    });
  }

  protected handleJobSuccess(jobData: CronJobData, checkInId: string) {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: OAuthTokenCleanupProcessor.monitorSlug,
      status: "ok",
    });
    return super.handleSuccess(jobData);
  }

  protected handleJobError(error: Error, checkInId: string) {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: OAuthTokenCleanupProcessor.monitorSlug,
      status: "error",
    });
    return super.handleError(error);
  }
}
