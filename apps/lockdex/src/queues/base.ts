import { type BaseJobOptions, type JobsOptions, Queue } from 'bullmq';
import redis from '@/lib/redis';
import type { BaseJobData } from '../types/jobs';

export abstract class BaseQueue<T extends BaseJobData> {
  protected queue: Queue<T>;

  constructor(name: string, options?: Omit<BaseJobOptions, 'connection'>) {
    this.queue = new Queue<T>(name, {
      connection: redis,
      ...options,
    });
  }

  async add(jobName: string, data: T, options?: JobsOptions) {
    // @ts-expect-error - BullMQ type compatibility issue with generic constraints
    return this.queue.add(jobName, data, options);
  }

  async addBulk(jobs: { name: string; data: T; options?: JobsOptions }[]) {
    // @ts-expect-error - BullMQ type compatibility issue with generic constraints
    return this.queue.addBulk(jobs);
  }

  async getJob(jobId: string) {
    return this.queue.getJob(jobId);
  }

  async getJobs(
    types: string[] = ['waiting', 'active', 'completed', 'failed']
  ) {
    // @ts-expect-error - BullMQ type compatibility issue with string array
    return this.queue.getJobs(types);
  }

  async pause() {
    return this.queue.pause();
  }

  async resume() {
    return this.queue.resume();
  }

  async close() {
    return this.queue.close();
  }

  getQueue() {
    return this.queue;
  }
}
