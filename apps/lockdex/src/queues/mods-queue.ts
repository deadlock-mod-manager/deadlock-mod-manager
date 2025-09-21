import { BaseQueue } from "@deadlock-mods/queue";
import { queueConfigs } from "@/config/queues";
import redis from "@/lib/redis";
import type { ModsJobData } from "@/types/jobs";

export class ModsQueue extends BaseQueue<ModsJobData> {
  constructor() {
    super(queueConfigs.mods.name, redis, {
      ...queueConfigs.mods.defaultJobOptions,
    });
  }

  async processMod(data: ModsJobData, priority = 0) {
    return this.add("process-mod", data, {
      priority,
      delay: (data.metadata?.delay as number) ?? 0,
    });
  }

  async processMods(mods: ModsJobData[]) {
    const jobs = mods.map((mod) => ({
      name: "process-mod",
      data: mod,
      options: {
        priority: (mod.metadata?.priority as number) ?? 0,
        delay: (mod.metadata?.delay as number) ?? 0,
      },
    }));
    return this.addBulk(jobs);
  }
}
