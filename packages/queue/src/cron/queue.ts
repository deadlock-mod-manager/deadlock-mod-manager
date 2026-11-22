import type { JobsOptions } from "bullmq";
import { BaseQueue } from "../base/queue";
import type { CronJobData } from "../types/jobs";

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
  async scheduleRecurring(
    schedulerId: string,
    cronPattern: string,
    template?: CronJobTemplate,
    options?: Omit<JobSchedulerOptions, "pattern">,
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
      template,
    );
  }

  async removeJobScheduler(schedulerId: string) {
    const jobSchedulers = await this.queue.getJobSchedulers();
    const schedulerToRemove = jobSchedulers.find(
      (scheduler) => scheduler.id === schedulerId,
    );

    if (schedulerToRemove) {
      await this.queue.removeJobScheduler(schedulerId);
      return true;
    }

    return false;
  }

  async getJobSchedulers() {
    return this.queue.getJobSchedulers();
  }

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

  async resumeJobSchedulers(
    schedulers: Awaited<ReturnType<typeof this.getJobSchedulers>>,
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
        scheduler.template,
      );
    }
  }
}
