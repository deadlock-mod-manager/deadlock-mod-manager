import { BaseQueue } from "@deadlock-mods/queue";
import { queueConfigs } from "@/config/queues";
import redis from "@/lib/redis";
import type { ModFileProcessingJobData } from "@/types/jobs";

export class ModFileProcessingQueue extends BaseQueue<ModFileProcessingJobData> {
  constructor() {
    super(queueConfigs.modFileProcessing.name, redis, {
      ...queueConfigs.modFileProcessing.defaultJobOptions,
    });
  }

  async processModFile(data: ModFileProcessingJobData, priority = 0) {
    return this.add("process-mod-file", data, {
      priority,
      delay: (data.metadata?.delay as number) ?? 0,
    });
  }

  async processModFiles(mods: ModFileProcessingJobData[]) {
    const jobs = mods.map((mod) => ({
      name: "process-mod-file",
      data: mod,
      options: {
        priority: (mod.metadata?.priority as number) ?? 0,
        delay: (mod.metadata?.delay as number) ?? 0,
      },
    }));
    return this.addBulk(jobs);
  }
}
