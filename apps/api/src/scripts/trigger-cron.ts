#!/usr/bin/env bun

import { logger } from "@/lib/logger";
import { ModsSyncProcessor } from "@/processors/mods-sync";
import { cronService } from "@/services/cron";

const triggerCron = async () => {
  const jobName = process.argv[2] ?? ModsSyncProcessor.name;

  const jobId = await cronService.triggerJob(jobName);

  logger
    .withMetadata({ jobName, jobId })
    .info("Queued cron job, watch the worker logs for the run");

  await cronService.shutdown();
  process.exit(0);
};

if (import.meta.main) {
  triggerCron();
}
