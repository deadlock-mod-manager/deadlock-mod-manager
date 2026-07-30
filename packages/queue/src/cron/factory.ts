import type { Logger } from "@deadlock-mods/logging";
import type { Redis } from "ioredis";
import type { QueueConfig } from "../types/queues";
import { CronService } from "./service";

const DEFAULT_CRON_JOB_OPTIONS: QueueConfig["defaultJobOptions"] = {
  attempts: 2,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
  removeOnComplete: 50,
  removeOnFail: 25,
};

const cronQueueName = (app: string) => `${app}-cron-queue`;

/**
 * Derives the queue name from the app name so that services sharing a Redis
 * instance cannot collide and consume each other's cron jobs.
 */
export const createCronService = (
  app: string,
  redis: Redis,
  logger: Logger,
  options?: {
    concurrency?: number;
    defaultJobOptions?: QueueConfig["defaultJobOptions"];
  },
) =>
  new CronService({
    queueName: cronQueueName(app),
    redis,
    logger,
    concurrency: options?.concurrency,
    defaultJobOptions: options?.defaultJobOptions ?? DEFAULT_CRON_JOB_OPTIONS,
  });
