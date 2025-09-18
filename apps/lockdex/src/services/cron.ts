import { logger } from '@/lib/logger';
import type { CronProcessor } from '@/processors/cron-processor';
import { CronQueue } from '@/queues/cron-queue';
import type { CronJobData } from '@/types/jobs';
import { CronWorker } from '@/workers/cron-worker';

export interface CronJobDefinition {
  name: string;
  pattern: string;
  processor: CronProcessor;
  concurrency?: number;
  timezone?: string;
  endDate?: Date;
  limit?: number;
  jobData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
}

export class CronService {
  private static instance: CronService | null = null;
  private queue: CronQueue;
  private workers: Map<string, CronWorker> = new Map();
  private jobs: Map<string, CronJobDefinition> = new Map();
  private defaultConcurrency: number;
  private pausedSchedulers: Awaited<ReturnType<CronQueue['getJobSchedulers']>> =
    [];

  private constructor(concurrency = 1) {
    this.queue = new CronQueue();
    this.defaultConcurrency = concurrency;
  }

  static getInstance(concurrency = 1): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService(concurrency);
    }
    return CronService.instance;
  }

  async defineJob(definition: CronJobDefinition): Promise<void> {
    const {
      name,
      pattern,
      processor,
      concurrency,
      timezone,
      endDate,
      limit,
      jobData = {},
      metadata = {},
      enabled = true,
    } = definition;

    // Store the job definition
    this.jobs.set(name, definition);

    const jobConcurrency = concurrency ?? this.defaultConcurrency;
    const workerKey = `${processor.constructor.name}-${jobConcurrency}`;

    if (!this.workers.has(workerKey)) {
      const worker = new CronWorker(processor, jobConcurrency);
      this.workers.set(workerKey, worker);
    }

    // Schedule the job if enabled
    if (enabled) {
      await this.upsertJob(name, pattern, {
        timezone,
        endDate,
        limit,
        jobData,
        metadata: { ...metadata, jobType: name },
      });
    }

    logger
      .withMetadata({
        enabled,
        timezone,
        endDate: endDate?.toISOString(),
        limit,
        processor: processor.constructor.name,
        concurrency: jobConcurrency,
      })
      .info(`Defined cron job: ${name} with pattern: ${pattern}`);
  }

  async defineJobs(definitions: CronJobDefinition[]): Promise<void> {
    const promises = definitions.map((def) => this.defineJob(def));
    await Promise.all(promises);
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
    }
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
      opts: {
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    };

    await this.queue.scheduleRecurring(jobName, cronPattern, template);
  }

  async enableJob(jobName: string): Promise<void> {
    const definition = this.jobs.get(jobName);
    if (!definition) {
      throw new Error(`Job not found: ${jobName}`);
    }

    // Ensure worker exists for this processor with the correct concurrency
    const jobConcurrency = definition.concurrency ?? this.defaultConcurrency;
    const workerKey = `${definition.processor.constructor.name}-${jobConcurrency}`;

    if (!this.workers.has(workerKey)) {
      const worker = new CronWorker(definition.processor, jobConcurrency);
      this.workers.set(workerKey, worker);
    }

    definition.enabled = true;
    await this.upsertJob(jobName, definition.pattern, {
      timezone: definition.timezone,
      endDate: definition.endDate,
      limit: definition.limit,
      jobData: definition.jobData,
      metadata: { ...definition.metadata, jobType: jobName },
    });

    logger.info(`Enabled cron job: ${jobName}`);
  }

  async disableJob(jobName: string): Promise<void> {
    const definition = this.jobs.get(jobName);
    if (!definition) {
      throw new Error(`Job not found: ${jobName}`);
    }

    definition.enabled = false;
    await this.queue.removeJobScheduler(jobName);

    logger.info(`Disabled cron job: ${jobName}`);
  }

  async removeJob(jobName: string): Promise<void> {
    await this.queue.removeJobScheduler(jobName);
    this.jobs.delete(jobName);

    logger.info(`Removed cron job: ${jobName}`);
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
        concurrency: definition?.concurrency,
        enabled: definition?.enabled ?? true,
      };
    });
  }

  async scheduleOneTime(
    jobName: string,
    delayMs: number,
    jobData: Record<string, unknown> = {},
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const cronJobData: CronJobData = {
      jobData,
      metadata: { ...metadata, jobType: jobName },
    };

    await this.queue.scheduleDelayed(jobName, cronJobData, delayMs);
    logger.info(`Scheduled one-time job: ${jobName} with delay: ${delayMs}ms`);
  }

  async scheduleInterval(
    jobName: string,
    intervalMs: number,
    jobData: Record<string, unknown> = {},
    options: {
      timezone?: string;
      endDate?: Date;
      limit?: number;
      metadata?: Record<string, unknown>;
      immediately?: boolean;
    } = {}
  ): Promise<void> {
    const cronJobData: CronJobData = {
      timezone: options.timezone,
      endDate: options.endDate,
      limit: options.limit,
      jobData,
      metadata: { ...options.metadata, jobType: jobName },
    };

    const template = {
      name: jobName,
      data: cronJobData,
      opts: {
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    };

    await this.queue.scheduleInterval(jobName, intervalMs, template, {
      immediately: options.immediately,
    });

    logger
      .withMetadata({
        intervalMs,
        immediately: options.immediately,
        timezone: options.timezone,
        endDate: options.endDate?.toISOString(),
        limit: options.limit,
      })
      .info(`Scheduled interval job: ${jobName} every ${intervalMs}ms`);
  }

  async pauseAll(): Promise<void> {
    try {
      // Pause the queue itself
      await this.queue.pause();

      // Store and pause all job schedulers
      this.pausedSchedulers = await this.queue.pauseJobSchedulers();
      logger.info(
        `Paused all cron jobs and ${this.pausedSchedulers.length} job schedulers`
      );
    } catch (error) {
      logger.withError(error).error('Failed to pause all cron jobs');
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
        logger.info(
          `Resumed all cron jobs and ${this.pausedSchedulers.length} job schedulers`
        );
        this.pausedSchedulers = [];
      } else {
        logger.info('Resumed all cron jobs');
      }
    } catch (error) {
      logger.withError(error).error('Failed to resume all cron jobs');
      throw error;
    }
  }

  async updateJob(
    jobName: string,
    updates: Partial<Omit<CronJobDefinition, 'name'>>
  ): Promise<void> {
    const currentDefinition = this.jobs.get(jobName);
    if (!currentDefinition) {
      throw new Error(`Job not found: ${jobName}`);
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

    logger
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
      (s) => s.id === jobName || s.name === jobName
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
    updates: Map<string, Partial<Omit<CronJobDefinition, 'name'>>>
  ): Promise<void> {
    const updatePromises = Array.from(updates.entries()).map(
      ([jobName, jobUpdates]) => this.updateJob(jobName, jobUpdates)
    );

    await Promise.all(updatePromises);
    logger.info(`Bulk updated ${updates.size} cron jobs`);
  }

  async getStats() {
    const scheduledJobs = await this.getScheduledJobs();
    return {
      definedJobs: this.jobs.size,
      enabledJobs: Array.from(this.jobs.values()).filter((job) => job.enabled)
        .length,
      scheduledJobs: scheduledJobs.length,
      workers: this.workers.size,
    };
  }

  async shutdown(): Promise<void> {
    const workerClosePromises = Array.from(this.workers.values()).map(
      (worker) => worker.close()
    );
    await Promise.all([...workerClosePromises, this.queue.close()]);
    this.workers.clear();
    logger.info('Cron service shutdown complete');
  }
}

export const cronService = CronService.getInstance();
