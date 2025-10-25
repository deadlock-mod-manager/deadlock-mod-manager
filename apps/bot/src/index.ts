import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { StatusMonitorService } from "@/lib/status-monitor";
import { DocumentationSyncProcessor } from "@/processors/documentation-sync.processor";
import { cronService } from "@/services/cron";
import { PromptSyncService } from "@/services/prompt-sync";
import { RedisSubscriberService } from "@/services/redis-subscriber";
import client from "./lib/discord";

const main = async () => {
  if (!env.BOT_ENABLED) {
    logger.info("Bot is disabled");
    return;
  }

  const promptSync = new PromptSyncService();
  await promptSync.syncPrompts();

  const statusMonitor = new StatusMonitorService();
  const redisSubscriber = RedisSubscriberService.getInstance();

  if (env.DOCS_SYNC_ENABLED) {
    logger.info("Defining documentation sync cron job");
    await cronService.defineJob({
      name: DocumentationSyncProcessor.name,
      pattern: DocumentationSyncProcessor.cronPattern,
      processor: DocumentationSyncProcessor.instance,
      enabled: true,
    });
  } else {
    logger.info("Documentation sync is disabled");
  }

  client.once("clientReady", async () => {
    logger.info(`Logged in as ${client.user?.tag}`);

    try {
      await Promise.all([statusMonitor.start(client), redisSubscriber.start()]);
    } catch (error) {
      logger.withError(error).error("Failed to start services");
    }
  });

  const shutdown = async () => {
    logger.info("Shutting down gracefully...");
    statusMonitor.stop();
    redisSubscriber.stop();
    await cronService.shutdown();
    client.destroy();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);

  process.on("SIGTERM", shutdown);

  process.on("unhandledRejection", (reason) => {
    logger
      .withError(reason instanceof Error ? reason : new Error(String(reason)))
      .error("Unhandled promise rejection");
    shutdown();
  });

  process.on("uncaughtException", (error) => {
    logger.withError(error).fatal("Uncaught exception");
    shutdown();
    process.exit(1);
  });

  await client.login(env.BOT_TOKEN);
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the bot");
    process.exit(1);
  });
}
