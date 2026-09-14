import {
  db,
  ModDownloadRepository,
  ModRepository,
  VpkRepository,
} from "@deadlock-mods/database";
import {
  parseModFilesUpdatedEvent,
  REDIS_CHANNELS,
} from "@deadlock-mods/shared";
import redis from "@/lib/redis";
import { logger } from "@/lib/logger";
import { buildModFileJob } from "@/lib/mod-file-job";
import type { ModFileProcessingJobData } from "@/types/jobs";
import { modFileProcessingQueue } from "./queue";

const modRepository = new ModRepository(db);
const downloadRepository = new ModDownloadRepository(db);
const vpkRepository = new VpkRepository(db);

export class ModFilesSubscriber {
  private readonly subscriber = redis.duplicate();

  async start(): Promise<void> {
    this.subscriber.on("error", (error) => {
      logger.withError(error).error("Lockdex mod event subscriber failed");
    });
    this.subscriber.on("message", (_channel, message) => {
      void this.handleMessage(message).catch((error) => {
        logger.withError(error).error("Failed to schedule updated mod files");
      });
    });
    await this.subscriber.subscribe(REDIS_CHANNELS.MOD_FILES_UPDATED);
    logger.info("Lockdex subscribed to GameBanana file updates");
  }

  async stop(): Promise<void> {
    await this.subscriber.unsubscribe(REDIS_CHANNELS.MOD_FILES_UPDATED);
    await this.subscriber.quit();
  }

  private async handleMessage(message: string): Promise<void> {
    const event = parseModFilesUpdatedEvent(JSON.parse(message));
    const mod = await modRepository.findBySubmissionIdentity(
      event.data.submissionType,
      event.data.submissionId,
    );
    if (!mod) {
      logger
        .withMetadata({ slug: event.data.slug })
        .warn("Updated submission is not available in the transition catalog");
      return;
    }

    const downloads = await downloadRepository.findByModId(mod.id);
    const marker = new Date(event.data.filesUpdatedAt);
    const pending: ModFileProcessingJobData[] = [];
    for (const download of downloads) {
      const completed = await vpkRepository.isIngestionComplete(
        event.data,
        download.remoteId,
        marker,
      );
      if (!completed) pending.push(buildModFileJob(event.data, download));
    }
    if (pending.length > 0) {
      await modFileProcessingQueue.processModFiles(pending);
    }
    logger
      .withMetadata({
        slug: event.data.slug,
        downloads: downloads.length,
        scheduled: pending.length,
      })
      .info("Handled GameBanana file update event");
  }
}

export const modFilesSubscriber = new ModFilesSubscriber();
