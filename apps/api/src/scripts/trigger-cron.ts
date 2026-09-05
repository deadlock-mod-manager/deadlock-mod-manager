#!/usr/bin/env bun

/**
 * Queues an immediate run of a cron job on the API cron queue. The worker
 * deployment owns the consumer, so it has to be running for the job to be
 * picked up, and the run shows up in its logs rather than the API's. Use this
 * to exercise the full queue path; `sync-mods` calls the service directly and
 * skips the worker, dispatch and Sentry check-in.
 *
 * Usage:
 * pnpm --filter api trigger-cron relay-discovery
 */

import { logger } from "@/lib/logger";
import { cronService } from "@/services/cron";

const triggerCron = async () => {
  const jobName = process.argv[2] ?? "relay-discovery";

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
