import type { Logger } from "@deadlock-mods/logging";
import type { Redis } from "ioredis";
import type { BaseProcessor } from "../base/processor";
import { BaseWorker } from "../base/worker";
import type { CronJobData } from "../types/jobs";

export class CronWorker extends BaseWorker<CronJobData> {
  constructor(
    queueName: string,
    redis: Redis,
    logger: Logger,
    processor: BaseProcessor<CronJobData>,
    concurrency = 1,
  ) {
    super(queueName, redis, logger, processor, concurrency);
  }
}
