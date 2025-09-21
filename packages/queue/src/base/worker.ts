import type { Logger } from "@deadlock-mods/logging";
import { type Job, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { BaseJobData } from "../types/jobs";
import type { BaseProcessor } from "./processor";

export class BaseWorker<T extends BaseJobData> {
  protected worker: Worker;
  protected logger: Logger;
  protected processor: BaseProcessor<T>;

  constructor(
    queueName: string,
    redis: Redis,
    logger: Logger,
    processor: BaseProcessor<T>,
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
    this.processor = processor;

    this.setupEventListeners();
  }

  private async processJob(job: Job<T>) {
    this.logger.info(`Processing job ${job.id} of type ${job.name}`);

    try {
      const result = await this.processor.process(job.data);

      if (!result.success) {
        throw new Error(result.error || "Processing failed");
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
