import * as _instrument from "./instrument";

import { CronPatterns } from "@deadlock-mods/queue/cron";
import { sentry } from "@hono/sentry";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { logger as loggerMiddleware } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { SENTRY_OPTIONS } from "./lib/constants";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { redis } from "./lib/redis";
import { cleanupProcessor } from "./processors/cleanup.processor";
import { validationProcessor } from "./processors/validation.processor";
import downloadRouter from "./routers/download";
import healthRouter from "./routers/health";
import metricsRouter from "./routers/metrics";
import { cronService } from "./services/cron";

const app = new Hono();

app.use(
  "*",
  requestId(),
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
  sentry({
    ...SENTRY_OPTIONS,
  }),
  etag(),
  loggerMiddleware((message: string, ...rest: string[]) => {
    logger.info(message, ...rest);
  }),
  secureHeaders(),
  trimTrailingSlash(),
);

app.route("/", healthRouter);
app.route("/download", downloadRouter);
app.route("/metrics", metricsRouter);

const main = async () => {
  logger.info(`Mirror service started on port ${env.PORT}`);

  // Define validation job with configurable interval
  const validationIntervalHours = env.VALIDATION_WORKER_INTERVAL_HOURS;
  const validationPattern =
    validationIntervalHours === 1
      ? CronPatterns.EVERY_HOUR
      : `0 0 */${validationIntervalHours} * * *`;

  await cronService.defineJob({
    name: "validation-worker",
    pattern: validationPattern,
    processor: validationProcessor,
    enabled: true,
  });

  // Define cleanup job to run daily at 2 AM
  await cronService.defineJob({
    name: "cleanup-worker",
    pattern: CronPatterns.MAINTENANCE_DAILY,
    processor: cleanupProcessor,
    enabled: true,
  });

  logger
    .withMetadata({
      validationIntervalHours,
      cleanupRetentionDays: env.CLEANUP_RETENTION_DAYS,
    })
    .info("Background workers initialized");

  Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
  });
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the mirror service");
    process.exit(1);
  });

  // Graceful shutdown handling
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, initiating graceful shutdown");

    try {
      await Promise.all([cronService.shutdown(), redis.disconnect()]);
      logger.info("Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      logger.withError(error).error("Error during graceful shutdown");
      process.exit(1);
    }
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT received, initiating graceful shutdown");

    try {
      await Promise.all([cronService.shutdown(), redis.disconnect()]);
      logger.info("Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      logger.withError(error).error("Error during graceful shutdown");
      process.exit(1);
    }
  });
}
