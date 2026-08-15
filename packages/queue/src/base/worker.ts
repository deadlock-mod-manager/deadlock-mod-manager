import { RuntimeError } from "@deadlock-mods/common";
import type { Logger } from "@deadlock-mods/logging";
import { type Job, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { BaseJobData } from "../types/jobs";
import {
  type ProcessorResolver,
  resolveProcessorOrThrow,
  toProcessorResolver,
} from "./dispatch";
import type { BaseProcessor } from "./processor";

export class BaseWorker<T extends BaseJobData> {
  protected worker: Worker;
  protected logger: Logger;
  protected resolveProcessor: ProcessorResolver<T>;

  constructor(
    queueName: string,
    redis: Redis,
    logger: Logger,
    processor: BaseProcessor<T> | ProcessorResolver<T>,
    concurrency = 1,
    autorun = true,
  ) {
    this.worker = new Worker(queueName, this.processJob.bind(this), {
      connection: redis,
      concurrency,
      autorun,
    });
    this.logger = logger.child().withContext({
      worker: `${queueName}-worker`,
      queue: queueName,
    });
    this.resolveProcessor = toProcessorResolver(processor);

    this.setupEventListeners();
  }

  /**
   * Only for workers constructed with `autorun: false`. `run()` resolves when
   * the worker stops, so it is deliberately not awaited.
   */
  start(): void {
    void this.worker.run().catch((error) => {
      this.logger.withError(error).error("Worker stopped unexpectedly");
    });
  }

  private async processJob(job: Job<T>) {
    this.logger.info(`Processing job ${job.id} of type ${job.name}`);

    try {
      const processor = resolveProcessorOrThrow(
        this.resolveProcessor,
        job.name,
        this.worker.name,
      );
      const result = await processor.process(job.data);

      if (!result.success) {
        throw new RuntimeError(result.error || "Processing failed");
      }

      return result.data;
    } catch (error) {
      this.logger.withError(error).error(`Job ${job.id} failed`);
      throw error;
    }
  }

  private setupEventListeners() {
    this.worker.on("completed", (job) => {
      this.logger.info(`Job ${job.id} completed successfully`);
    });

    this.worker.on("failed", (job, err) => {
      this.logger.withError(err).error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.worker.on("error", (err) => {
      this.logger.withError(err).error("Worker error");
    });
  }

  async close() {
    await this.worker.close();
  }
}
