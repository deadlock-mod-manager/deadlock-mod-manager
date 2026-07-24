import { RuntimeError } from "@deadlock-mods/common";
import type { Logger } from "@deadlock-mods/logging";
import { type Job, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { CronJobDefinition } from "./service";
import type { CronJobData } from "../types/jobs";

export class CronWorker {
  private worker: Worker;
  private logger: Logger;
  private jobs: Map<string, CronJobDefinition>;

  constructor(
    queueName: string,
    redis: Redis,
    logger: Logger,
    jobs: Map<string, CronJobDefinition>,
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
    this.jobs = jobs;

    this.setupEventListeners();
  }

  private async processJob(job: Job<CronJobData>) {
    this.logger.info(`Processing job ${job.id} of type ${job.name}`);

    const definition = this.jobs.get(job.name);
    if (!definition) {
      const error = new RuntimeError(
        `No cron processor registered for job: ${job.name}`,
      );
      this.logger
        .withMetadata({
          jobId: job.id,
          jobName: job.name,
          metadataJobType: job.data.metadata?.jobType,
          registeredJobs: this.getRegisteredJobNames(),
        })
        .withError(error)
        .error("Cron job has no registered processor");
      throw error;
    }

    const jobType = job.data.metadata?.jobType;
    if (typeof jobType === "string" && jobType !== job.name) {
      const error = new RuntimeError(
        `Cron job metadata mismatch: ${job.name} has jobType ${jobType}`,
      );
      this.logger
        .withMetadata({
          jobId: job.id,
          jobName: job.name,
          metadataJobType: jobType,
          registeredJobs: this.getRegisteredJobNames(),
        })
        .withError(error)
        .error("Cron job metadata does not match job name");
      throw error;
    }

    try {
      const result = await definition.processor.process(job.data);

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

  private getRegisteredJobNames(): string[] {
    return Array.from(this.jobs.keys()).sort();
  }
}
