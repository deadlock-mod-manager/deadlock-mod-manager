import type { SapphireClient } from "@sapphire/framework";
import { logger } from "@/lib/logger";
import { cronService } from "@/services/cron";

export interface ShutdownHandler {
  stop: () => void;
}

export class ProcessManager {
  private shutdownHandlers: ShutdownHandler[] = [];
  private client: SapphireClient | null = null;

  registerShutdownHandler(handler: ShutdownHandler): void {
    this.shutdownHandlers.push(handler);
  }

  setClient(client: SapphireClient): void {
    this.client = client;
  }

  setupSignalHandlers(): void {
    const shutdown = async () => {
      logger.info("Shutting down gracefully...");

      for (const handler of this.shutdownHandlers) {
        handler.stop();
      }

      await cronService.shutdown();

      if (this.client) {
        this.client.destroy();
      }

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
  }
}
