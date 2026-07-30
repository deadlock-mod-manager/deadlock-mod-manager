import { NotFoundError, RuntimeError } from "@deadlock-mods/common";
import type { Logger } from "@deadlock-mods/logging";
import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import type { BaseProcessor } from "../base/processor";
import { BaseWorker } from "../base/worker";
import type { CronJobData } from "../types/jobs";
import { CronQueue } from "./queue";
import type { CronJobDefinition, CronServiceOptions } from "./types";

/**
 * Owns a single BullMQ queue of named cron jobs and the one worker that drains
 * it. Jobs must be registered with `defineJob` before `start` opens the worker;
 * registering after start would expose the worker to jobs it cannot resolve.
 */
export class CronService {
  private queue: CronQueue;
  private queueName: string;
  private worker: BaseWorker<CronJobData> | null = null;
  private jobs: Map<string, CronJobDefinition> = new Map();
  private concurrency: number;
  private logger: Logger;
  private redis: Redis;

  constructor({
    queueName,
    redis,
    logger,
    concurrency = 1,
    defaultJobOptions,
  }: CronServiceOptions) {
    this.queue = new CronQueue(queueName, redis, { defaultJobOptions });
    this.queueName = queueName;
    this.concurrency = concurrency;
    this.redis = redis;
    this.logger = logger.child().withContext({
      service: "CronService",
      queue: queueName,
    });
  }

  async defineJob(definition: CronJobDefinition): Promise<void> {
    if (this.worker) {
      throw new RuntimeError(
        `Cannot define cron job ${definition.name} after the service has started`,
      );
    }

    const {
      name,
      pattern,
      processor,
      jobData = {},
      metadata = {},
    } = definition;

    this.jobs.set(name, definition);

    await this.queue.scheduleRecurring(name, pattern, {
      name,
      data: {
        cronPattern: pattern,
        timezone: definition.timezone,
        endDate: definition.endDate,
        limit: definition.limit,
        jobData,
        metadata: { ...metadata, jobType: name },
      },
    });

    this.logger
      .withMetadata({
        jobName: name,
        pattern,
        timezone: definition.timezone,
        processor: processor.constructor.name,
      })
      .info("Defined cron job");
  }

  async defineJobs(definitions: CronJobDefinition[]): Promise<void> {
    for (const definition of definitions) {
      await this.defineJob(definition);
    }
  }

  start(): void {
    if (this.worker) {
      throw new RuntimeError(
        `Cron service for ${this.queueName} is already started`,
      );
    }

    this.worker = new BaseWorker<CronJobData>(
      this.queueName,
      this.redis,
      this.logger,
      (job) => this.resolveProcessor(job),
      this.concurrency,
    );

    this.logger
      .withMetadata({
        jobs: this.registeredJobNames(),
        concurrency: this.concurrency,
      })
      .info("Cron service started");
  }

  async shutdown(): Promise<void> {
    await Promise.all([this.worker?.close(), this.queue.close()]);
    this.worker = null;
    this.logger.info("Cron service shutdown complete");
  }

  private resolveProcessor(job: Job<CronJobData>): BaseProcessor<CronJobData> {
    const definition = this.jobs.get(job.name);

    if (!definition) {
      throw new NotFoundError(
        `No cron processor registered for job ${job.name} on queue ${this.queueName}; registered jobs: ${this.registeredJobNames().join(", ")}`,
      );
    }

    return definition.processor;
  }

  private registeredJobNames(): string[] {
    return Array.from(this.jobs.keys()).sort();
  }
}
