import type { JobsOptions } from "bullmq";
import { BaseQueue } from "../base/queue";
import type { CronJobData } from "../types/jobs";

export interface CronJobTemplate {
  name?: string;
  data?: CronJobData;
  opts?: JobsOptions;
}

export class CronQueue extends BaseQueue<CronJobData> {
  /**
   * Upserts a BullMQ job scheduler, so redeploys re-point an existing schedule
   * rather than stacking a second one.
   */
  async scheduleRecurring(
    schedulerId: string,
    cronPattern: string,
    template?: CronJobTemplate,
  ) {
    return this.queue.upsertJobScheduler(
      schedulerId,
      {
        pattern: cronPattern,
        tz: template?.data?.timezone,
        endDate: template?.data?.endDate,
        limit: template?.data?.limit,
      },
      template,
    );
  }
}
