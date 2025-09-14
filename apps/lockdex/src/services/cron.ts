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
  private queue: CronQueue;
  private workers: Map<string, CronWorker> = new Map();
  private jobs: Map<string, CronJobDefinition> = new Map();
  private defaultConcurrency: number;

  constructor(concurrency = 1) {
    this.queue = new CronQueue();
    this.defaultConcurrency = concurrency;
  }

  /**
   * Define and schedule a cron job
   * @param definition - Cron job definition
   */
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

    // Create a unique worker key based on processor and concurrency
    const jobConcurrency = concurrency ?? this.defaultConcurrency;
    const workerKey = `${processor.constructor.name}-${jobConcurrency}`;

    if (!this.workers.has(workerKey)) {
      const worker = new CronWorker(processor, jobConcurrency);
      this.workers.set(workerKey, worker);
    }

    // Schedule the job if enabled
    if (enabled) {
      await this.scheduleJob(name, pattern, {
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

  /**
   * Define multiple cron jobs at once
   * @param definitions - Array of cron job definitions
   */
  async defineJobs(definitions: CronJobDefinition[]): Promise<void> {
    const promises = definitions.map((def) => this.defineJob(def));
    await Promise.all(promises);
  }

  /**
   * Schedule a job with cron pattern
   */
  private async scheduleJob(
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
      id: `cron-${jobName}-${Date.now()}`,
      timestamp: new Date(),
      cronPattern,
      timezone: options.timezone,
      endDate: options.endDate,
      limit: options.limit,
      jobData: options.jobData || {},
      metadata: options.metadata,
    };

    await this.queue.scheduleRecurring(jobName, cronJobData, cronPattern);
  }

  /**
   * Enable a previously defined job
   * @param jobName - Name of the job to enable
   */
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
    await this.scheduleJob(jobName, definition.pattern, {
      timezone: definition.timezone,
      endDate: definition.endDate,
      limit: definition.limit,
      jobData: definition.jobData,
      metadata: { ...definition.metadata, jobType: jobName },
    });

    logger.info(`Enabled cron job: ${jobName}`);
  }

  /**
   * Disable a job (removes it from the schedule)
   * @param jobName - Name of the job to disable
   */
  async disableJob(jobName: string): Promise<void> {
    const definition = this.jobs.get(jobName);
    if (!definition) {
      throw new Error(`Job not found: ${jobName}`);
    }

    definition.enabled = false;
    await this.queue.removeRepeatable(jobName);

    logger.info(`Disabled cron job: ${jobName}`);
  }

  /**
   * Remove a job definition completely
   * @param jobName - Name of the job to remove
   */
  async removeJob(jobName: string): Promise<void> {
    await this.queue.removeRepeatable(jobName);
    this.jobs.delete(jobName);

    logger.info(`Removed cron job: ${jobName}`);
  }

  /**
   * Get all defined jobs
   */
  getJobs(): Map<string, CronJobDefinition> {
    return new Map(this.jobs);
  }

  /**
   * Get a specific job definition
   * @param jobName - Name of the job
   */
  getJob(jobName: string): CronJobDefinition | undefined {
    return this.jobs.get(jobName);
  }

  /**
   * Check if a job is defined
   * @param jobName - Name of the job
   */
  hasJob(jobName: string): boolean {
    return this.jobs.has(jobName);
  }

  /**
   * Get all scheduled/repeatable jobs from the queue
   */
  async getScheduledJobs() {
    return this.queue.getRepeatableJobs();
  }

  /**
   * Schedule a one-time job with a delay
   * @param jobName - Name of the job
   * @param delayMs - Delay in milliseconds
   * @param jobData - Data for the job
   * @param metadata - Optional metadata
   */
  async scheduleOneTime(
    jobName: string,
    delayMs: number,
    jobData: Record<string, unknown> = {},
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const cronJobData: CronJobData = {
      id: `onetime-${jobName}-${Date.now()}`,
      timestamp: new Date(),
      jobData,
      metadata: { ...metadata, jobType: jobName },
    };

    await this.queue.scheduleDelayed(jobName, cronJobData, delayMs);
    logger.info(`Scheduled one-time job: ${jobName} with delay: ${delayMs}ms`);
  }

  /**
   * Schedule a job to run at intervals
   * @param jobName - Name of the job
   * @param intervalMs - Interval in milliseconds
   * @param jobData - Data for the job
   * @param options - Additional options
   */
  async scheduleInterval(
    jobName: string,
    intervalMs: number,
    jobData: Record<string, unknown> = {},
    options: {
      timezone?: string;
      endDate?: Date;
      limit?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    const cronJobData: CronJobData = {
      id: `interval-${jobName}-${Date.now()}`,
      timestamp: new Date(),
      timezone: options.timezone,
      endDate: options.endDate,
      limit: options.limit,
      jobData,
      metadata: { ...options.metadata, jobType: jobName },
    };

    await this.queue.scheduleInterval(jobName, cronJobData, intervalMs);
    logger.info(`Scheduled interval job: ${jobName} every ${intervalMs}ms`);
  }

  /**
   * Pause all cron jobs
   */
  async pauseAll(): Promise<void> {
    await this.queue.pause();
    logger.info('Paused all cron jobs');
  }

  /**
   * Resume all cron jobs
   */
  async resumeAll(): Promise<void> {
    await this.queue.resume();
    logger.info('Resumed all cron jobs');
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      definedJobs: this.jobs.size,
      enabledJobs: Array.from(this.jobs.values()).filter((job) => job.enabled)
        .length,
    };
  }

  /**
   * Shutdown the cron service
   */
  async shutdown(): Promise<void> {
    const workerClosePromises = Array.from(this.workers.values()).map(
      (worker) => worker.close()
    );
    await Promise.all([...workerClosePromises, this.queue.close()]);
    this.workers.clear();
    logger.info('Cron service shutdown complete');
  }
}
