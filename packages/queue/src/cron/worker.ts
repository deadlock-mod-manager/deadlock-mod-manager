import type { Logger } from "@deadlock-mods/logging";
import type { Redis } from "ioredis";
import type { ProcessorResolver } from "../base/dispatch";
import { BaseWorker } from "../base/worker";
import type { CronJobData } from "../types/jobs";

export class CronWorker extends BaseWorker<CronJobData> {
  constructor(
    queueName: string,
    redis: Redis,
    logger: Logger,
    resolveProcessor: ProcessorResolver<CronJobData>,
    concurrency = 1,
  ) {
    // Held until every job is registered, otherwise a due job can be claimed
    // before its processor is resolvable
    super(queueName, redis, logger, resolveProcessor, concurrency, false);
  }
}
