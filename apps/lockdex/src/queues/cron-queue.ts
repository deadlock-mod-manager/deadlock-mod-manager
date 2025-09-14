import type { JobsOptions } from 'bullmq';
import { queueConfigs } from '@/config/queues';
import type { CronJobData } from '@/types/jobs';
import { BaseQueue } from './base';

export interface CronJobOptions extends JobsOptions {
  repeat?: {
    pattern?: string;
    every?: number;
    immediately?: boolean;
    limit?: number;
    endDate?: Date;
    tz?: string;
    utc?: boolean;
  };
}

export class CronQueue extends BaseQueue<CronJobData> {
  constructor() {
    super(queueConfigs.cron.name, {
      ...queueConfigs.cron.defaultJobOptions,
    });
  }

  /**
   * Schedule a recurring job using cron pattern
   * @param jobName - Name of the job
   * @param data - Job data
   * @param cronPattern - Cron pattern (e.g., '0 star/5 star star star star' for every 5 minutes)
   * @param options - Additional job options
   */
  async scheduleRecurring(
    jobName: string,
    data: CronJobData,
    cronPattern: string,
    options?: Omit<CronJobOptions, 'repeat'>
  ) {
    const jobOptions: CronJobOptions = {
      ...options,
      repeat: {
        pattern: cronPattern,
        tz: data.timezone,
        endDate: data.endDate,
        limit: data.limit,
      },
    };

    return this.add(jobName, { ...data, cronPattern }, jobOptions);
  }

  /**
   * Schedule a job to run at a specific interval (in milliseconds)
   * @param jobName - Name of the job
   * @param data - Job data
   * @param intervalMs - Interval in milliseconds
   * @param options - Additional job options
   */
  async scheduleInterval(
    jobName: string,
    data: CronJobData,
    intervalMs: number,
    options?: Omit<CronJobOptions, 'repeat'>
  ) {
    const jobOptions: CronJobOptions = {
      ...options,
      repeat: {
        every: intervalMs,
        immediately: !options?.delay,
        tz: data.timezone,
        endDate: data.endDate,
        limit: data.limit,
      },
    };

    return this.add(jobName, data, jobOptions);
  }

  /**
   * Schedule a one-time job with delay
   * @param jobName - Name of the job
   * @param data - Job data
   * @param delayMs - Delay in milliseconds
   * @param options - Additional job options
   */
  async scheduleDelayed(
    jobName: string,
    data: CronJobData,
    delayMs: number,
    options?: JobsOptions
  ) {
    return this.add(jobName, data, {
      ...options,
      delay: delayMs,
    });
  }

  /**
   * Remove a repeating job
   * @param jobName - Name of the job to remove
   * @param repeatJobKey - Optional repeat job key for specific repeat job
   */
  async removeRepeatable(jobName: string, repeatJobKey?: string) {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const jobsToRemove = repeatableJobs.filter(
      (job) =>
        job.name === jobName && (!repeatJobKey || job.key === repeatJobKey)
    );

    for (const job of jobsToRemove) {
      await this.queue.removeRepeatableByKey(job.key);
    }

    return jobsToRemove.length;
  }

  /**
   * Get all repeatable jobs
   */
  async getRepeatableJobs() {
    return this.queue.getRepeatableJobs();
  }

  /**
   * Pause all repeatable jobs
   */
  async pauseRepeatable() {
    const repeatableJobs = await this.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.queue.removeRepeatableByKey(job.key);
    }
    return repeatableJobs;
  }

  /**
   * Resume repeatable jobs from a previous pause
   * @param jobs - Array of repeatable jobs to resume
   */
  async resumeRepeatable(
    jobs: Awaited<ReturnType<typeof this.getRepeatableJobs>>
  ) {
    for (const job of jobs) {
      // Re-add the job with the same repeat options
      await this.queue.add(job.name, {} as CronJobData, {
        repeat: {
          pattern: job.pattern || undefined,
          tz: job.tz || undefined,
        },
      });
    }
  }
}
