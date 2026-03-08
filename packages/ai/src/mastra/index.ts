import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { PinoLogger } from "@mastra/loggers";
import { dmmAgent } from "./agents/dmm";
import { env } from "../env";

const mastraLogger = new PinoLogger({
  name: "mastra",
  // level: "debug",
});

const storage = new PostgresStore({
  id: "mastra-storage",
  connectionString: env.DATABASE_URL,
});

export const mastra = new Mastra({
  agents: { dmmAgent },
  storage,
  logger: mastraLogger,
});
