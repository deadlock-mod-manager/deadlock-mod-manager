#!/usr/bin/env bun

/**
 * Queues an immediate run of a cron job on the API cron queue. The API process
 * owns the worker, so it has to be running for the job to be picked up. Use
 * this to exercise the full queue path; `sync-mods` calls the service directly
 * and skips the worker, dispatch and Sentry check-in.
 *
 * Usage:
 * pnpm --filter api trigger-cron            # defaults to the mod sync
 * pnpm --filter api trigger-cron GamebananaRssProcessor
 */

import { logger } from "@/lib/logger";
import { ModsSyncProcessor } from "@/processors/mods-sync";
import { cronService } from "@/services/cron";

const triggerCron = async () => {
  const jobName = process.argv[2] ?? ModsSyncProcessor.name;

  const jobId = await cronService.triggerJob(jobName);

  logger
    .withMetadata({ jobName, jobId })
    .info("Queued cron job, watch the API logs for the run");

  await cronService.shutdown();
  process.exit(0);
};

if (import.meta.main) {
  triggerCron();
}
