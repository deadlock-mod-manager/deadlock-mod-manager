import type { Job } from 'bullmq';
import { ModFileProcessingQueue } from '@/queues/mod-file-processing-queue';
import { ModsQueue } from '@/queues/mods-queue';
import type { ModFileProcessingJobData, ModsJobData } from '@/types/jobs';

export class QueueService {
  private modsQueue: ModsQueue;
  private modFileProcessingQueue: ModFileProcessingQueue;

  constructor() {
    this.modsQueue = new ModsQueue();
    this.modFileProcessingQueue = new ModFileProcessingQueue();
  }

  async addModProcessingJob(data: ModsJobData, priority?: number) {
    return this.modsQueue.processMod(data, priority);
  }

  async addModFileProcessingJob(
    data: ModFileProcessingJobData,
    priority?: number
  ) {
    return this.modFileProcessingQueue.processMod(data, priority);
  }

  async addModFileProcessingJobs(data: ModFileProcessingJobData[]) {
    return this.modFileProcessingQueue.processMods(data);
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
