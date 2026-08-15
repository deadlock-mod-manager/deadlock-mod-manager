import type { Logger } from "@deadlock-mods/logging";
import type { Redis } from "ioredis";
import type { BaseProcessor } from "../base/processor";
import type { CronJobData } from "../types/jobs";
import type { QueueConfig } from "../types/queues";

export interface CronJobDefinition {
  name: string;
  pattern: string;
  processor: BaseProcessor<CronJobData>;
  timezone?: string;
  endDate?: Date;
  limit?: number;
  jobData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CronServiceOptions {
  queueName: string;
  redis: Redis;
  logger: Logger;
  concurrency?: number;
  defaultJobOptions?: QueueConfig["defaultJobOptions"];
}
