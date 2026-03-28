import { logger } from "@/lib/logger";

type TeardownFn = () => void | Promise<void>;

export class ProcessManager {
  private readonly teardowns: { label: string; fn: TeardownFn }[] = [];
  private shuttingDown = false;

  registerTeardown(label: string, fn: TeardownFn): void {
    this.teardowns.push({ label, fn });
  }

  setupSignalHandlers(): void {
    const shutdown = async (exitCode: number) => {
      if (this.shuttingDown) {
        return;
      }
      this.shuttingDown = true;
      logger.info("Shutting down gracefully...");

      for (const { label, fn } of this.teardowns) {
        try {
          await Promise.resolve(fn());
        } catch (error) {
          logger
            .withError(
              error instanceof Error ? error : new Error(String(error)),
            )
            .withMetadata({ teardown: label })
            .error("Teardown failed");
        }
      }

      process.exit(exitCode);
    };

    process.on("SIGINT", () => {
      void shutdown(0);
    });
    process.on("SIGTERM", () => {
      void shutdown(0);
    });

    process.on("unhandledRejection", (reason) => {
      logger
        .withError(reason instanceof Error ? reason : new Error(String(reason)))
        .error("Unhandled promise rejection");
      void shutdown(1);
    });

    process.on("uncaughtException", (error) => {
      logger.withError(error).fatal("Uncaught exception");
      void shutdown(1);
    });
  }
}
