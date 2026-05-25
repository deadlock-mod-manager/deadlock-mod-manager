import { ConfigurationError } from "@deadlock-mods/common";
import { workbench } from "@getworkbench/hono";
import { type Job, Queue } from "bullmq";
import { env } from "./env";
import { redis } from "./redis";

export const WORKBENCH_BASE_PATH = "/internal/jobs";

const QUEUE_NAMES = [
  "cron-queue",
  "mods-queue",
  "mod-file-processing-queue",
  "mirror-service-cron-queue",
] as const;

let workbenchQueues: Queue[] = [];

function isDefinedJob(job: Job | null | undefined): job is Job {
  return job != null;
}

function createMonitoringQueue(name: string): Queue {
  const queue = new Queue(name, { connection: redis });
  const getJobs = queue.getJobs.bind(queue);

  queue.getJobs = (...args: Parameters<Queue["getJobs"]>) =>
    getJobs(...args).then((jobs) => jobs.filter(isDefinedJob));

  return queue;
}

export function createWorkbenchQueues(): Queue[] {
  workbenchQueues = QUEUE_NAMES.map((name) => createMonitoringQueue(name));
  return workbenchQueues;
}

export function createWorkbenchRoute() {
  if (!env.WORKBENCH_USERNAME || !env.WORKBENCH_PASSWORD) {
    throw new ConfigurationError(
      "WORKBENCH_USERNAME and WORKBENCH_PASSWORD are required when Workbench is enabled",
    );
  }

  return workbench({
    queues: createWorkbenchQueues(),
    auth: {
      username: env.WORKBENCH_USERNAME,
      password: env.WORKBENCH_PASSWORD,
    },
    title: "Deadlock Mod Manager",
    basePath: WORKBENCH_BASE_PATH,
    tags: ["jobType"],
  });
}

export async function closeWorkbenchQueues(): Promise<void> {
  await Promise.all(workbenchQueues.map((queue) => queue.close()));
  workbenchQueues = [];
}
