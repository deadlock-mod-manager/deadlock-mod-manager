import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { PinoLogger } from "@mastra/loggers";
import type { AiConfig } from "../config";
import { createDmmAgent } from "./agents/dmm";

const mastraLogger = new PinoLogger({
  name: "mastra",
});

export async function createMastra(config: AiConfig) {
  const { agent: dmmAgent, mcpClients } = await createDmmAgent(config);

  const storage = new PostgresStore({
    id: "mastra-storage",
    connectionString: config.DATABASE_URL,
  });

  const mastra = new Mastra({
    agents: { dmmAgent },
    storage,
    logger: mastraLogger,
  });

  const disconnectAllMcps = async (): Promise<void> => {
    await Promise.all(mcpClients.map((client) => client.disconnect()));
  };

  return { mastra, disconnectAllMcps };
}
