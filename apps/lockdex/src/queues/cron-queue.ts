import type { JobsOptions } from 'bullmq';
import { queueConfigs } from '@/config/queues';
import type { CronJobData } from '@/types/jobs';
import { BaseQueue } from './base';

export interface JobSchedulerOptions {
  pattern?: string;
  every?: number;
  immediately?: boolean;
  limit?: number;
  endDate?: Date;
  tz?: string;
  utc?: boolean;
}

export interface CronJobTemplate {
  name?: string;
  data?: CronJobData;
  opts?: JobsOptions;
}

export class CronQueue extends BaseQueue<CronJobData> {
  constructor() {
    super(queueConfigs.cron.name, {
      ...queueConfigs.cron.defaultJobOptions,
    });
  }

  async scheduleRecurring(
    schedulerId: string,
    cronPattern: string,
    template?: CronJobTemplate,
    options?: Omit<JobSchedulerOptions, 'pattern'>
  ) {
    const schedulerOptions: JobSchedulerOptions = {
      pattern: cronPattern,
      tz: template?.data?.timezone || options?.tz,
      endDate: template?.data?.endDate || options?.endDate,
      limit: template?.data?.limit || options?.limit,
    };

    return this.queue.upsertJobScheduler(
      schedulerId,
      schedulerOptions,
      template
    );
  }

  /**
   * Schedule a job to run at a specific interval (in milliseconds) with Job Scheduler
   * @param schedulerId - Unique identifier for the job scheduler
   * @param intervalMs - Interval in milliseconds
   * @param template - Job template with name, data, and options
   * @param options - Additional scheduler options
   */
  async scheduleInterval(
    schedulerId: string,
    intervalMs: number,
    template?: CronJobTemplate,
    options?: Omit<JobSchedulerOptions, 'every'>
  ) {
    const schedulerOptions: JobSchedulerOptions = {
      every: intervalMs,
      tz: template?.data?.timezone || options?.tz,
      endDate: template?.data?.endDate || options?.endDate,
      limit: template?.data?.limit || options?.limit,
    };

    return this.queue.upsertJobScheduler(
      schedulerId,
      schedulerOptions,
      template
    );
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
   * Remove a job scheduler
   * @param schedulerId - Unique identifier of the job scheduler to remove
   */
  async removeJobScheduler(schedulerId: string) {
    const jobSchedulers = await this.queue.getJobSchedulers();
    const schedulerToRemove = jobSchedulers.find(
      (scheduler) => scheduler.id === schedulerId
    );

    if (schedulerToRemove) {
      await this.queue.removeJobScheduler(schedulerId);
      return true;
    }

    return false;
  }

  /**
   * Get all job schedulers
   */
  async getJobSchedulers() {
    return this.queue.getJobSchedulers();
  }

  /**
   * Pause all job schedulers
   */
  async pauseJobSchedulers() {
    const jobSchedulers = await this.getJobSchedulers();
    const pausedSchedulers: Awaited<ReturnType<typeof this.getJobSchedulers>> =
      [];

    for (const scheduler of jobSchedulers) {
      if (!scheduler.id) {
        continue;
      }

      await this.queue.removeJobScheduler(scheduler.id);
      pausedSchedulers.push(scheduler);
    }

    return pausedSchedulers;
  }

  /**
   * Resume job schedulers from a previous pause
   * @param schedulers - Array of job schedulers to resume
   */
  async resumeJobSchedulers(
    schedulers: Awaited<ReturnType<typeof this.getJobSchedulers>>
  ) {
    for (const scheduler of schedulers) {
      if (!scheduler.id) {
        continue;
      }

      await this.queue.upsertJobScheduler(
        scheduler.id,
        {
          pattern: scheduler.pattern || undefined,
          every: scheduler.every || undefined,
          tz: scheduler.tz || undefined,
          endDate: scheduler.endDate || undefined,
          limit: scheduler.limit || undefined,
        },
        scheduler.template
      );
    }
  }
}
