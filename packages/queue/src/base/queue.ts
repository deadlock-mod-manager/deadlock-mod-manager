import {
  type JobsOptions,
  type QueueOptions,
  type DefaultJobOptions,
  Queue,
} from "bullmq";
import type { Redis } from "ioredis";
import type { BaseJobData } from "../types/jobs";

function isQueueOptions(
  opts: Omit<QueueOptions, "connection"> | DefaultJobOptions | undefined,
): opts is Omit<QueueOptions, "connection"> {
  if (opts === undefined || typeof opts !== "object") return false;
  const key: keyof QueueOptions = "defaultJobOptions";
  return key in opts && opts.defaultJobOptions !== undefined;
}

export class BaseQueue<T extends BaseJobData = BaseJobData> {
  protected queue: Queue<T>;

  constructor(
    name: string,
    redis: Redis,
    options?: Omit<QueueOptions, "connection"> | DefaultJobOptions,
  ) {
    const queueOptions: QueueOptions = isQueueOptions(options)
      ? { connection: redis, ...options }
      : options
        ? { connection: redis, defaultJobOptions: options }
        : { connection: redis };

    this.queue = new Queue<T>(name, queueOptions);
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
    types: string[] = ["waiting", "active", "completed", "failed"],
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
