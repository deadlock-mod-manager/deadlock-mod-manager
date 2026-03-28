import {
  parseNewModEvent,
  parseNewReportEvent,
  parseReportStatusUpdatedEvent,
  REDIS_CHANNELS,
} from "@deadlock-mods/shared";
import IORedis from "ioredis";
import { inject, singleton } from "tsyringe";
import { env } from "@/lib/env";
import { logger, runWithWideEvent, wideEventContext } from "@/lib/logger";
import { ForumPosterService } from "@/mods/forum-poster.service";
import { ReportPosterService } from "@/reports/report-poster.service";

@singleton()
export class RedisSubscriberService {
  private subscriber: IORedis | null = null;
  private isStarted = false;

  constructor(
    @inject(ForumPosterService)
    private readonly forumPoster: ForumPosterService,
    @inject(ReportPosterService)
    private readonly reportPoster: ReportPosterService,
  ) {}

  async start(): Promise<void> {
    if (this.isStarted) {
      logger
        .withMetadata({ service: "redis-subscriber" })
        .warn("Redis subscriber already started");
      return;
    }

    await runWithWideEvent(
      wideEventContext,
      logger,
      "redis_subscriber_start",
      { service: "redis-subscriber" },
      async (wide) => {
        this.subscriber = new IORedis(env.REDIS_URL, {
          maxRetriesPerRequest: null,
          lazyConnect: false,
        });

        this.subscriber.on("error", (error) => {
          logger.withError(error).error("Redis subscriber error");
        });

        this.subscriber.on("connect", () => {
          wide.merge({ redisConnection: "connected" });
        });

        this.subscriber.on("ready", () => {
          wide.merge({ redisConnection: "ready" });
        });

        await this.subscriber.subscribe(REDIS_CHANNELS.NEW_MODS);
        await this.subscriber.subscribe(REDIS_CHANNELS.NEW_REPORTS);
        await this.subscriber.subscribe(REDIS_CHANNELS.REPORT_STATUS_UPDATED);

        this.subscriber.on("message", async (channel, message) => {
          await this.handleMessage(channel, message);
        });

        this.isStarted = true;
        wide.merge({ subscribedChannels: 3 });
      },
    );
  }

  async stop(): Promise<void> {
    if (!this.isStarted || !this.subscriber) {
      return;
    }

    await runWithWideEvent(
      wideEventContext,
      logger,
      "redis_subscriber_stop",
      { service: "redis-subscriber" },
      async (wide) => {
        await this.subscriber?.unsubscribe();
        await this.subscriber?.quit();

        this.subscriber = null;
        this.isStarted = false;

        wide.merge({ stopped: true });
      },
    );
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    await runWithWideEvent(
      wideEventContext,
      logger,
      "redis_message",
      {
        service: "redis-subscriber",
        channel,
        messageLength: message.length,
      },
      async (wide) => {
        wide.merge({ messagePreview: message.substring(0, 200) });

        switch (channel) {
          case REDIS_CHANNELS.NEW_MODS: {
            const rawData = JSON.parse(message);
            const event = parseNewModEvent(rawData);
            await this.forumPoster.postNewMod(event);
            wide.merge({ eventKind: "new_mod" });
            break;
          }
          case REDIS_CHANNELS.NEW_REPORTS: {
            const rawData = JSON.parse(message);
            const event = parseNewReportEvent(rawData);
            await this.reportPoster.postNewReport(event);
            wide.merge({ eventKind: "new_report" });
            break;
          }
          case REDIS_CHANNELS.REPORT_STATUS_UPDATED: {
            const rawData = JSON.parse(message);
            const event = parseReportStatusUpdatedEvent(rawData);
            await this.reportPoster.updateReportStatus(event);
            wide.merge({ eventKind: "report_status_updated" });
            break;
          }
          default:
            wide.merge({ unknownChannel: true });
        }
      },
    );
  }
}
