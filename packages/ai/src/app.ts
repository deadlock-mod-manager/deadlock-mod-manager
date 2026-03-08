import { Hono } from "hono";
import { cors } from "hono/cors";
import { MastraServer } from "@mastra/hono";
import type { ToolsInput } from "@mastra/core/agent";
import { mastra } from "./mastra";
import { env } from "./env";
import type { AppEnv } from "./types";
import { logger } from "./logger";
import { err, ok } from "neverthrow";
import { RuntimeError } from "@deadlock-mods/common";

export interface CreateAppOptions {
  tools?: ToolsInput;
}

export const createApp = async (options: CreateAppOptions = {}) => {
  const { tools } = options;

  try {
    const app = new Hono<AppEnv>();
    const mastraServer = new MastraServer({ app, mastra, tools });

    app.use(
      "*",
      cors({
        origin: env.TRUSTED_ORIGINS,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        credentials: true,
      }),
    );

    await mastraServer.init();
    return ok({ app, mastraServer });
  } catch (error) {
    logger.withError(error).error("Failed to initialize Mastra server");
    return err(new RuntimeError("Failed to initialize Mastra server", error));
  }
};
