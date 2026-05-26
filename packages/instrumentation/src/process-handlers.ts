import type { Logger } from "@deadlock-mods/logging";

export const registerProcessHandlers = (logger: Logger) => {
  process.on("unhandledRejection", (reason) => {
    if (reason instanceof Error) {
      logger.withError(reason).error("Unhandled promise rejection");
      return;
    }

    logger
      .withMetadata({ reason: String(reason) })
      .error("Unhandled promise rejection");
  });

  process.on("uncaughtException", (error) => {
    logger.withError(error).fatal("Uncaught exception");
    process.exit(1);
  });
};
