import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { StatusMonitorService } from "@/lib/status-monitor";
import client from "./lib/discord";

const main = async () => {
  if (env.BOT_ENABLED) {
    const statusMonitor = new StatusMonitorService();

    client.once("clientReady", async () => {
      logger.info(`Logged in as ${client.user?.tag}`);

      try {
        await statusMonitor.start(client);
      } catch (error) {
        logger.withError(error).error("Failed to start status monitoring");
      }
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
      logger.info("Received SIGINT, shutting down gracefully...");
      statusMonitor.stop();
      client.destroy();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      logger.info("Received SIGTERM, shutting down gracefully...");
      statusMonitor.stop();
      client.destroy();
      process.exit(0);
    });

    client.login(env.BOT_TOKEN);
  } else {
    logger.info("Bot is disabled");
  }
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the bot");
  });
}
