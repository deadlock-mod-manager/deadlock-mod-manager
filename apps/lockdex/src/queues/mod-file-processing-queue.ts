import { BaseQueue } from "@deadlock-mods/queue";
import { queueConfigs } from "@/config/queues";
import { modFileJobId } from "@/lib/mod-file-job";
import redis from "@/lib/redis";
import type { ModFileProcessingJobData } from "@/types/jobs";

export class ModFileProcessingQueue extends BaseQueue<ModFileProcessingJobData> {
  constructor() {
    super(queueConfigs.modFileProcessing.name, redis, {
      ...queueConfigs.modFileProcessing.defaultJobOptions,
    });
  }

  /**
   * BullMQ runs jobs without a priority before prioritized ones, so live
   * update events go ahead of anything queued with a priority.
   */
  async processModFiles(
    mods: ModFileProcessingJobData[],
    options: { priority?: number } = {},
  ) {
    const jobs = mods.map((mod) => ({
      name: "process-mod-file",
      data: mod,
      options: { jobId: modFileJobId(mod), priority: options.priority },
    }));
    return this.addBulk(jobs);
  }

  async countUnfinished(): Promise<number> {
    const counts = await this.getQueue().getJobCounts(
      "wait",
      "prioritized",
      "delayed",
      "active",
    );
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }
}
