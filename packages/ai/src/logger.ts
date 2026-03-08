import { createAppLogger } from "@deadlock-mods/logging";

export const logger = createAppLogger({
  app: "ai",
});

export const createServiceLogger = (service: string) =>
  logger.withContext({ service });
