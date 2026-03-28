import {
  parseNewModEvent,
  parseNewReportEvent,
  parseReportStatusUpdatedEvent,
  REDIS_CHANNELS,
} from "@deadlock-mods/shared";
import IORedis from "ioredis";
import { ZodError } from "zod";
import { inject, singleton } from "tsyringe";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";
import { ForumPosterService } from "@/mods/forum-poster.service";
import { ReportPosterService } from "@/reports/report-poster.service";

const logger = mainLogger.child().withContext({
  service: "redis-subscriber",
});

async function handleParsedMessage<T>(
  message: string,
  parse: (data: unknown) => T,
  label: string,
  processEvent: (event: T) => Promise<void>,
): Promise<void> {
  try {
    const rawData: unknown = JSON.parse(message);
    const event = parse(rawData);
    await processEvent(event);
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger
        .withError(error)
        .withMetadata({
          message: message.substring(0, 200),
        })
        .error(`Failed to parse ${label} JSON`);
      return;
    }
    if (error instanceof ZodError) {
      logger
        .withError(error)
        .withMetadata({
          message: message.substring(0, 200),
        })
        .error(`Failed to validate ${label} schema`);
      return;
    }
    logger.withError(error).error(`Error processing ${label}`);
  }
}

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
      logger.warn("Redis subscriber already started");
      return;
    }

    try {
      logger.info("Starting Redis subscriber service");

      this.subscriber = new IORedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: false,
      });

      this.subscriber.on("error", (error) => {
        logger.withError(error).error("Redis subscriber error");
      });

      this.subscriber.on("connect", () => {
        logger.info("Redis subscriber connected");
      });

      this.subscriber.on("ready", () => {
        logger.info("Redis subscriber ready");
      });

      await this.subscriber.subscribe(REDIS_CHANNELS.NEW_MODS);
      await this.subscriber.subscribe(REDIS_CHANNELS.NEW_REPORTS);
      await this.subscriber.subscribe(REDIS_CHANNELS.REPORT_STATUS_UPDATED);

      this.subscriber.on("message", async (channel, message) => {
        await this.handleMessage(channel, message);
      });

      this.isStarted = true;
      logger.info("Redis subscriber service started successfully");
    } catch (error) {
      logger.withError(error).error("Failed to start Redis subscriber service");
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted || !this.subscriber) {
      return;
    }

    try {
      logger.info("Stopping Redis subscriber service");

      await this.subscriber.unsubscribe();
      await this.subscriber.quit();

      this.subscriber = null;
      this.isStarted = false;

      logger.info("Redis subscriber service stopped");
    } catch (error) {
      logger.withError(error).error("Error stopping Redis subscriber service");
    }
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    try {
      logger
        .withMetadata({
          channel,
          messageLength: message.length,
        })
        .debug("Received Redis message");

      switch (channel) {
        case REDIS_CHANNELS.NEW_MODS:
          await handleParsedMessage(
            message,
            parseNewModEvent,
            "new mod event",
            (event) => this.forumPoster.postNewMod(event),
          );
          break;
        case REDIS_CHANNELS.NEW_REPORTS:
          await handleParsedMessage(
            message,
            parseNewReportEvent,
            "new report event",
            (event) => this.reportPoster.postNewReport(event),
          );
          break;
        case REDIS_CHANNELS.REPORT_STATUS_UPDATED:
          await handleParsedMessage(
            message,
            parseReportStatusUpdatedEvent,
            "report status updated event",
            (event) => this.reportPoster.updateReportStatus(event),
          );
          break;
        default:
          logger
            .withMetadata({ channel })
            .warn("Received message from unknown channel");
      }
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          channel,
          message: message.substring(0, 200),
        })
        .error("Error handling Redis message");
    }
  }
}
