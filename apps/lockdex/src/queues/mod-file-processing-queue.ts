import { queueConfigs } from '@/config/queues';
import type { ModFileProcessingJobData, ModsJobData } from '@/types/jobs';
import { BaseQueue } from './base';

export class ModFileProcessingQueue extends BaseQueue<ModsJobData> {
  constructor() {
    super(queueConfigs.modFileProcessing.name, {
      ...queueConfigs.modFileProcessing.defaultJobOptions,
    });
  }

  async processMod(data: ModFileProcessingJobData, priority = 0) {
    return this.add('process-mod-file', data, {
      priority,
      delay: (data.metadata?.delay as number) ?? 0,
    });
  }

  async processMods(mods: ModFileProcessingJobData[]) {
    const jobs = mods.map((mod) => ({
      name: 'process-mod-file',
      data: mod,
      options: {
        priority: (mod.metadata?.priority as number) ?? 0,
        delay: (mod.metadata?.delay as number) ?? 0,
      },
    }));
    return this.addBulk(jobs);
  }
}
