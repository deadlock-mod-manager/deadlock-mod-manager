import type { JobType } from "bullmq";

interface RetiredJobsQueue {
  getJobSchedulers(): Promise<{ key: string; name: string }[]>;
  removeJobScheduler(key: string): Promise<boolean>;
  getRepeatableJobs(): Promise<{ key: string; name: string }[]>;
  removeRepeatableByKey(key: string): Promise<boolean>;
  getJobs(
    types: JobType[],
  ): Promise<{ name: string; remove(): Promise<void> }[]>;
}

export async function removeRetiredCronJobs(
  queue: RetiredJobsQueue,
  jobNames: readonly string[],
) {
  const retired = new Set(jobNames);
  for (const scheduler of await queue.getJobSchedulers()) {
    if (retired.has(scheduler.name))
      await queue.removeJobScheduler(scheduler.key);
  }
  for (const repeatable of await queue.getRepeatableJobs()) {
    if (retired.has(repeatable.name))
      await queue.removeRepeatableByKey(repeatable.key);
  }
  // Active jobs may belong to a draining worker from the previous deployment.
  for (const job of await queue.getJobs([
    "wait",
    "delayed",
    "paused",
    "prioritized",
    "waiting-children",
  ])) {
    if (retired.has(job.name)) await job.remove();
  }
}
