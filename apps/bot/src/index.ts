// oxlint-disable import/no-unassigned-import
import "./instrument";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import healthRouter from "@/routers/health";
import { BotApplication, type AppEnv } from "./bot-application";
import client from "./lib/discord";

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: env.TRUSTED_ORIGINS,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.route("/", healthRouter);

const main = async () => {
  await new BotApplication(app, client).run();
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the bot");
    process.exit(1);
  });
}
