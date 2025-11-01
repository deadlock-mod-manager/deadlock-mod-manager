import "./instrument";

import { Hono } from "hono";
import { logger as loggerMiddleware } from "hono/logger";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ProcessManager } from "@/lib/process-manager";
import { StatusMonitorService } from "@/lib/status-monitor";
import healthRouter, { setHealthReady } from "@/routers/health";
import { BotStartupService } from "@/services/bot-startup";
import { RedisSubscriberService } from "@/services/redis-subscriber";
import client from "./lib/discord";

const app = new Hono();

app.use(
  "*",
  loggerMiddleware((message: string, ...rest: string[]) => {
    logger.info(message, ...rest);
  }),
);

app.route("/", healthRouter);

const main = async () => {
  logger.info("Starting health check server on port 3001");
  Bun.serve({
    port: 3001,
    fetch: app.fetch,
  });

  if (!env.BOT_ENABLED) {
    logger.info("Bot is disabled");
    return;
  }

  const startupService = new BotStartupService();
  await startupService.initialize(client);

  const statusMonitor = new StatusMonitorService();
  const redisSubscriber = RedisSubscriberService.getInstance();

  const processManager = new ProcessManager();
  processManager.setClient(client);
  processManager.registerShutdownHandler(statusMonitor);
  processManager.registerShutdownHandler(redisSubscriber);
  processManager.setupSignalHandlers();

  client.once("clientReady", async () => {
    logger.info(`Logged in as ${client.user?.tag}`);

    try {
      await Promise.all([statusMonitor.start(client), redisSubscriber.start()]);
      setHealthReady(true);
      logger.info("Bot is fully initialized and ready");
    } catch (error) {
      logger.withError(error).error("Failed to start services");
      setHealthReady(false);
    }
  });
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the bot");
    process.exit(1);
  });
}
