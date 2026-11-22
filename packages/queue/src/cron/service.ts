import { ConfigurationError, NotFoundError } from "@deadlock-mods/common";
import type { Logger } from "@deadlock-mods/logging";
import type { JobsOptions } from "bullmq";
import type { Redis } from "ioredis";
import type { BaseProcessor } from "../base/processor";
import type { CronJobData } from "../types/jobs";
import type { QueueConfig } from "../types/queues";
import { CronQueue } from "./queue";
import { removeRetiredCronJobs } from "./remove-retired-jobs";
import { CronWorker } from "./worker";

export interface CronJobDefinition {
  name: string;
  pattern: string;
  processor: BaseProcessor<CronJobData>;
  timezone?: string;
  endDate?: Date;
  limit?: number;
  jobData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
  jobOptions?: JobsOptions;
}

export type CronServiceQueueOptions = Pick<QueueConfig, "defaultJobOptions">;

export class CronService {
  private queue: CronQueue;
  private worker: CronWorker | null = null;
  private jobs: Map<string, CronJobDefinition> = new Map();
  private concurrency: number;
  private pausedSchedulers: Awaited<ReturnType<CronQueue["getJobSchedulers"]>> =
    [];
  private logger: Logger;
  private redis: Redis;

  constructor(
    queueName: string,
    redis: Redis,
    logger: Logger,
    concurrency = 1,
    queueOptions?: CronServiceQueueOptions,
  ) {
    this.queue = new CronQueue(queueName, redis, {
      defaultJobOptions: queueOptions?.defaultJobOptions,
    });
    this.concurrency = concurrency;
    this.logger = logger.child().withContext({
      service: "CronService",
      queue: queueName,
    });
    this.redis = redis;
  }

  async defineJob(definition: CronJobDefinition): Promise<void> {
    const {
      name,
      pattern,
      processor,
      timezone,
      endDate,
      limit,
      jobData = {},
      metadata = {},
      enabled = true,
      jobOptions,
    } = definition;

    this.jobs.set(name, definition);

    if (enabled) {
      await this.upsertJob(name, pattern, {
        timezone,
        endDate,
        limit,
        jobData,
        metadata: { ...metadata, jobType: name },
        jobOptions,
      });
    }

    this.logger
      .withMetadata({
        enabled,
        timezone,
        endDate: endDate?.toISOString(),
        limit,
        processor: processor.constructor.name,
      })
      .info(`Defined cron job: ${name} with pattern: ${pattern}`);
  }

  async removeRetiredJobs(jobNames: readonly string[]): Promise<void> {
    for (const name of jobNames) {
      if (this.jobs.has(name))
        throw new ConfigurationError(
          `Cannot retire a defined cron job: ${name}`,
        );
    }
    await removeRetiredCronJobs(this.queue.getQueue(), jobNames);
    this.logger.withMetadata({ jobNames }).info("Removed retired cron jobs");
  }

  async defineJobs(definitions: CronJobDefinition[]): Promise<void> {
    const promises = definitions.map((def) => this.defineJob(def));
    await Promise.all(promises);
  }

  start(): void {
    if (this.jobs.size === 0) {
      throw new NotFoundError("No cron jobs defined, nothing to start");
    }

    this.ensureWorker().start();
    this.logger
      .withMetadata({ jobs: this.jobs.size, concurrency: this.concurrency })
      .info("Cron service started");
  }

  isRunning(): boolean {
    return this.worker?.isRunning() ?? false;
  }

  getWorkerError(): Error | null {
    return this.worker?.getLastError() ?? null;
  }

  private ensureWorker(): CronWorker {
    if (!this.worker) {
      this.worker = new CronWorker(
        this.queue.getQueue().name,
        this.redis,
        this.logger,
        (jobName) => this.jobs.get(jobName)?.processor,
        this.concurrency,
      );
    }

    return this.worker;
  }

  private async upsertJob(
    jobName: string,
    cronPattern: string,
    options: {
      timezone?: string;
      endDate?: Date;
      limit?: number;
      jobData?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      jobOptions?: JobsOptions;
    },
  ): Promise<void> {
    const cronJobData: CronJobData = {
      cronPattern,
      timezone: options.timezone,
      endDate: options.endDate,
      limit: options.limit,
      jobData: options.jobData || {},
      metadata: options.metadata,
    };

    const template = {
      name: jobName,
      data: cronJobData,
      opts: options.jobOptions,
    };

    await this.queue.scheduleRecurring(jobName, cronPattern, template);
  }

  async triggerJob(
    jobName: string,
    jobData: Record<string, unknown> = {},
  ): Promise<string | undefined> {
    const job = await this.queue.add(jobName, {
      jobData,
      metadata: { jobType: jobName, trigger: "manual" },
    });

    this.logger
      .withMetadata({ jobId: job.id })
      .info(`Triggered cron job: ${jobName}`);

    return job.id;
  }

  async enableJob(jobName: string): Promise<void> {
    const definition = this.jobs.get(jobName);
    if (!definition) {
      throw new NotFoundError(`Job not found: ${jobName}`);
    }

    definition.enabled = true;
    await this.upsertJob(jobName, definition.pattern, {
      timezone: definition.timezone,
      endDate: definition.endDate,
      limit: definition.limit,
      jobData: definition.jobData,
      metadata: { ...definition.metadata, jobType: jobName },
      jobOptions: definition.jobOptions,
    });

    this.logger.info(`Enabled cron job: ${jobName}`);
  }

  async disableJob(jobName: string): Promise<void> {
    const definition = this.jobs.get(jobName);
    if (!definition) {
      throw new NotFoundError(`Job not found: ${jobName}`);
    }

    definition.enabled = false;
    await this.queue.removeJobScheduler(jobName);

    this.logger.info(`Disabled cron job: ${jobName}`);
  }

  async removeJob(jobName: string): Promise<void> {
    await this.queue.removeJobScheduler(jobName);
    this.jobs.delete(jobName);

    this.logger.info(`Removed cron job: ${jobName}`);
  }

  getJobs(): Map<string, CronJobDefinition> {
    return new Map(this.jobs);
  }

  getJob(jobName: string): CronJobDefinition | undefined {
    return this.jobs.get(jobName);
  }

  hasJob(jobName: string): boolean {
    return this.jobs.has(jobName);
  }

  async getScheduledJobs() {
    const jobSchedulers = await this.queue.getJobSchedulers();
    return jobSchedulers.map((scheduler) => {
      const schedulerId = scheduler.id || scheduler.name;
      const definition = this.jobs.get(schedulerId);
      return {
        id: schedulerId,
        name: scheduler.name,
        pattern: scheduler.pattern,
        every: scheduler.every,
        tz: scheduler.tz,
        endDate: scheduler.endDate,
        limit: scheduler.limit,
        next: scheduler.next,
        processor: definition?.processor?.constructor.name,
        enabled: definition?.enabled ?? true,
      };
    });
  }

  async pauseAll(): Promise<void> {
    try {
      await this.queue.pause();

      this.pausedSchedulers = await this.queue.pauseJobSchedulers();
      this.logger.info(
        `Paused all cron jobs and ${this.pausedSchedulers.length} job schedulers`,
      );
    } catch (error) {
      this.logger.withError(error).error("Failed to pause all cron jobs");
      throw error;
    }
  }

  async resumeAll(): Promise<void> {
    try {
      await this.queue.resume();

      if (this.pausedSchedulers.length > 0) {
        await this.queue.resumeJobSchedulers(this.pausedSchedulers);
        this.logger.info(
          `Resumed all cron jobs and ${this.pausedSchedulers.length} job schedulers`,
        );
        this.pausedSchedulers = [];
      } else {
        this.logger.info("Resumed all cron jobs");
      }
    } catch (error) {
      this.logger.withError(error).error("Failed to resume all cron jobs");
      throw error;
    }
  }

  async updateJob(
    jobName: string,
    updates: Partial<Omit<CronJobDefinition, "name">>,
  ): Promise<void> {
    const currentDefinition = this.jobs.get(jobName);
    if (!currentDefinition) {
      throw new NotFoundError(`Job not found: ${jobName}`);
    }

    const updatedDefinition = { ...currentDefinition, ...updates };
    this.jobs.set(jobName, updatedDefinition);

    if (updatedDefinition.enabled) {
      await this.upsertJob(jobName, updatedDefinition.pattern, {
        timezone: updatedDefinition.timezone,
        endDate: updatedDefinition.endDate,
        limit: updatedDefinition.limit,
        jobData: updatedDefinition.jobData,
        metadata: { ...updatedDefinition.metadata, jobType: jobName },
      });
    }

    this.logger
      .withMetadata({
        updates,
        enabled: updatedDefinition.enabled,
      })
      .info(`Updated cron job: ${jobName}`);
  }

  async isJobScheduled(jobName: string): Promise<boolean> {
    const schedulers = await this.queue.getJobSchedulers();
    return schedulers.some((scheduler) => scheduler.id === jobName);
  }

  async getJobSchedulerInfo(jobName: string) {
    const schedulers = await this.queue.getJobSchedulers();
    const scheduler = schedulers.find(
      (s) => s.id === jobName || s.name === jobName,
    );

    if (!scheduler) {
      return null;
    }

    return {
      id: scheduler.id || scheduler.name,
      name: scheduler.name,
      pattern: scheduler.pattern,
      every: scheduler.every,
      tz: scheduler.tz,
      endDate: scheduler.endDate,
      limit: scheduler.limit,
      next: scheduler.next,
      template: scheduler.template,
    };
  }

  async bulkUpdateJobs(
    updates: Map<string, Partial<Omit<CronJobDefinition, "name">>>,
  ): Promise<void> {
    const updatePromises = Array.from(updates.entries()).map(
      ([jobName, jobUpdates]) => this.updateJob(jobName, jobUpdates),
    );

    await Promise.all(updatePromises);
    this.logger.info(`Bulk updated ${updates.size} cron jobs`);
  }

  async getStats() {
    const scheduledJobs = await this.getScheduledJobs();
    return {
      definedJobs: this.jobs.size,
      enabledJobs: Array.from(this.jobs.values()).filter((job) => job.enabled)
        .length,
      scheduledJobs: scheduledJobs.length,
      concurrency: this.worker ? this.concurrency : 0,
    };
  }

  async shutdown(): Promise<void> {
    await Promise.all([this.worker?.close(), this.queue.close()]);
    this.worker = null;
    this.logger.info("Cron service shutdown complete");
  }
}
