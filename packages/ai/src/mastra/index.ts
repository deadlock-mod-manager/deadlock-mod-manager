import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { PinoLogger } from "@mastra/loggers";
import type { AiConfig } from "../config";
import { createDmmAgent } from "./agents/dmm";

const mastraLogger = new PinoLogger({
  name: "mastra",
});

export async function createMastra(config: AiConfig) {
  const dmmAgent = await createDmmAgent(config);

  const storage = new PostgresStore({
    id: "mastra-storage",
    connectionString: config.DATABASE_URL,
  });

  return new Mastra({
    agents: { dmmAgent },
    storage,
    logger: mastraLogger,
  });
}
