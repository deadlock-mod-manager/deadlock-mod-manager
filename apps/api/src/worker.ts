// oxlint-disable import/no-unassigned-import
import "./instrument";

import { registerProcessHandlers } from "@deadlock-mods/instrumentation";
import { type Context, Hono } from "hono";
import { cronJobDefinitions } from "./config/cron-jobs";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { cronService } from "./services/cron";
import { HealthService } from "./services/health";
import { version } from "./version";

/**
 * Consumes the API cron queue. `index.ts` neither declares nor runs scheduled
 * jobs, so this is the only process that does.
 */

let draining = false;

const app = new Hono();

/**
 * A worker whose run loop has died still answers database and Redis checks, so
 * probes have to assert that it is consuming rather than merely alive. Draining
 * counts as healthy: BullMQ clears the flag when shutdown starts, and failing
 * liveness then would kill the drain we are waiting for.
 */
const getWorkerState = () => {
  const running = cronService.isRunning();
  return {
    running,
    draining,
    healthy: running || draining,
    stoppedBecause: cronService.getWorkerError()?.message,
  };
};

app.get("/health/live", (c: Context) => {
  const worker = getWorkerState();

  return c.json(
    { status: worker.healthy ? "ok" : "stopped", worker, version },
    worker.healthy ? 200 : 503,
  );
});

app.get("/health/ready", async (c: Context) => {
  const health = await HealthService.getInstance().check();
  const worker = getWorkerState();
  const ready = health.status === "ok" && worker.running;

  if (!ready) {
    logger
      .withMetadata({ health, worker })
      .warn("Worker readiness check degraded");
  }

  return c.json(
    { ...health, status: ready ? "ok" : "degraded", worker },
    ready ? 200 : 503,
  );
});

app.get("/", (c: Context) =>
  c.json({ status: "ok", worker: getWorkerState(), version }, 200),
);

const main = async () => {
  registerProcessHandlers(logger);

  logger.info("Defining cron jobs");
  await cronService.defineJobs(cronJobDefinitions);

  cronService.start();

  process.on("SIGTERM", async () => {
    draining = true;
    logger.info("SIGTERM received, draining in-flight cron jobs");

    await cronService.shutdown();
    process.exit(0);
  });

  const server = Bun.serve({
    port: env.WORKER_PORT,
    fetch: app.fetch,
  });

  logger
    .withMetadata({ port: server.port, jobs: cronJobDefinitions.length })
    .info("Worker started");
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the worker");
    process.exit(1);
  });
}
