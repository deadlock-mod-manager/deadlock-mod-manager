import type { Job } from 'bullmq';
import { ModsQueue } from '@/queues/mods-queue';
import type { ModsJobData } from '@/types/jobs';

export class QueueService {
  private modsQueue: ModsQueue;

  constructor() {
    this.modsQueue = new ModsQueue();
  }

  async addModProcessingJob(data: ModsJobData, priority?: number) {
    return this.modsQueue.processMod(data, priority);
  }

  async getQueueStats() {
    const modsStats = await this.modsQueue.getJobs();

    return {
      mods: {
        total: modsStats.length,
        byStatus: this.groupJobsByStatus(modsStats),
      },
    };
  }

  private groupJobsByStatus(jobs: Job[]) {
    return jobs.reduce(
      (acc, job) => {
        const status = job.finishedOn
          ? 'completed'
          : job.failedReason
            ? 'failed'
            : job.processedOn
              ? 'active'
              : 'waiting';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  async shutdown() {
    await Promise.all([this.modsQueue.close()]);
  }
}

export const queueService = new QueueService();
