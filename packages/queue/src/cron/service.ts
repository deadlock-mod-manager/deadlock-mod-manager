import { NotFoundError } from "@deadlock-mods/common";
import type { Logger } from "@deadlock-mods/logging";
import type { JobsOptions } from "bullmq";
import type { Redis } from "ioredis";
import type { BaseProcessor } from "../base/processor";
import type { CronJobData } from "../types/jobs";
import type { QueueConfig } from "../types/queues";
import { CronQueue } from "./queue";
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
  /** Overrides the queue defaults. Recurring jobs usually want `attempts: 1`. */
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

  /**
   * @param concurrency How many cron jobs this service may run at once. A long
   * job holds a slot for its whole run, so this needs to be at least the number
   * of jobs defined or a slow job will starve the rest.
   */
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

    // Store the job definition
    this.jobs.set(name, definition);
    this.ensureWorker();

    // Schedule the job if enabled
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

  async defineJobs(definitions: CronJobDefinition[]): Promise<void> {
    const promises = definitions.map((def) => this.defineJob(def));
    await Promise.all(promises);
  }

  /**
   * Begins consuming the queue. Call once every job is defined, since the
   * worker dispatches on job name and can only resolve jobs it knows about.
   */
  start(): void {
    if (!this.worker) {
      throw new NotFoundError("No cron jobs defined, nothing to start");
    }

    this.worker.start();
    this.logger
      .withMetadata({ jobs: this.jobs.size, concurrency: this.concurrency })
      .info("Cron service started");
  }

  /**
   * A cron queue carries jobs for many processors, so a single worker consumes
   * it and dispatches on job name. Giving each processor its own worker would
   * let any worker claim any job and run it through the wrong processor.
   */
  private ensureWorker(): void {
    if (this.worker) {
      return;
    }

    this.worker = new CronWorker(
      this.queue.getQueue().name,
      this.redis,
      this.logger,
      (jobName) => this.jobs.get(jobName)?.processor,
      this.concurrency,
    );
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

  /**
   * Queues a single immediate run of a scheduled job, bypassing its pattern.
   * The caller does not have to own the worker, so this works from a CLI while
   * the service that defined the job picks the run up.
   */
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

    this.ensureWorker();

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
      // Pause the queue itself
      await this.queue.pause();

      // Store and pause all job schedulers
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
      // Resume the queue itself
      await this.queue.resume();

      // Resume all previously paused job schedulers
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

    // Merge the updates with the current definition
    const updatedDefinition = { ...currentDefinition, ...updates };
    this.jobs.set(jobName, updatedDefinition);

    // If the job is enabled, update the scheduler
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
