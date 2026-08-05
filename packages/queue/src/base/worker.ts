import { RuntimeError } from "@deadlock-mods/common";
import type { Logger } from "@deadlock-mods/logging";
import { type Job, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { BaseJobData } from "../types/jobs";
import type { BaseProcessor } from "./processor";

/**
 * Selects the processor for a job. Workers bound to a single processor return
 * it unconditionally; workers serving a queue of differently-named jobs (cron)
 * dispatch on `job.name`.
 */
export type ProcessorResolver<T> = (job: Job<T>) => BaseProcessor<T>;

export class BaseWorker<T extends BaseJobData> {
  protected worker: Worker;
  protected logger: Logger;
  protected resolveProcessor: ProcessorResolver<T>;

  constructor(
    queueName: string,
    redis: Redis,
    logger: Logger,
    resolveProcessor: ProcessorResolver<T>,
    concurrency = 1,
  ) {
    this.worker = new Worker(queueName, this.processJob.bind(this), {
      connection: redis,
      concurrency,
    });
    this.logger = logger.child().withContext({
      worker: `${queueName}-worker`,
      queue: queueName,
    });
    this.resolveProcessor = resolveProcessor;

    this.setupEventListeners();
  }

  private async processJob(job: Job<T>) {
    this.logger
      .withMetadata({ jobId: job.id, jobName: job.name })
      .info("Processing job");

    const processor = this.resolveProcessor(job);
    const result = await processor.process(job.data);

    if (!result.success) {
      throw new RuntimeError(result.error || "Processing failed");
    }

    return result.data;
  }

  private setupEventListeners() {
    this.worker.on("completed", (job) => {
      this.logger
        .withMetadata({ jobId: job.id, jobName: job.name })
        .info("Job completed");
    });

    this.worker.on("failed", (job, error) => {
      this.logger
        .withMetadata({ jobId: job?.id, jobName: job?.name })
        .withError(error)
        .error("Job failed");
    });

    this.worker.on("error", (error) => {
      this.logger.withError(error).error("Worker error");
    });
  }

  async close() {
    await this.worker.close();
  }
}
