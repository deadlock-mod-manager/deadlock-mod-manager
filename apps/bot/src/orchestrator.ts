import { createMastra, ingestDocs } from "@deadlock-mods/ai";
import {
  MastraServer,
  type HonoBindings,
  type HonoVariables,
} from "@mastra/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "@/lib/env";
import client from "@/lib/discord";
import { logger } from "@/lib/logger";
import { ProcessManager } from "@/lib/process-manager";
import healthRouter from "@/routers/health";
import { HealthService } from "@/services/health";
import { RedisSubscriberService } from "@/services/redis-subscriber";
import { chatBot } from "./chat";

export type AppEnv = { Bindings: HonoBindings; Variables: HonoVariables };

export class Orchestrator {
  private readonly app: Hono<AppEnv>;
  private readonly processManager: ProcessManager;
  private readonly client = client;

  constructor() {
    this.processManager = new ProcessManager();
    this.app = new Hono<AppEnv>();
    this.app.use(
      "*",
      cors({
        origin: env.TRUSTED_ORIGINS,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        credentials: true,
      }),
    );
    this.app.route("/", healthRouter);
  }

  async initializeChat(): Promise<void> {
    await chatBot.initialize();
  }

  async initializeMastra(): Promise<void> {
    const mastra = await createMastra(env);
    const mastraServer = new MastraServer({ app: this.app, mastra });
    await mastraServer.init();
  }

  startHttpServer(): void {
    logger.info(`Starting HTTP server on port ${env.PORT}`);
    Bun.serve({
      port: env.PORT,
      fetch: this.app.fetch,
    });
  }

  scheduleDocsIngest(): void {
    const docsIngestLogger = logger.child().withContext({
      service: "docs-ingest",
    });
    ingestDocs(env)
      .then(() => docsIngestLogger.info("Docs ingestion complete"))
      .catch((err) =>
        docsIngestLogger
          .withError(err instanceof Error ? err : new Error(String(err)))
          .warn(
            "Docs ingestion failed, searchDocsTool may return empty results",
          ),
      );
  }

  private registerProcessTeardowns(): void {
    const redisSubscriber = RedisSubscriberService.getInstance();

    this.processManager.registerTeardown("redis-subscriber", () =>
      redisSubscriber.stop(),
    );
    this.processManager.registerTeardown("chat", () => chatBot.shutdown());
    this.processManager.registerTeardown("discord-client", () => {
      this.client.destroy();
    });
    this.processManager.setupSignalHandlers();
  }

  async startDiscordIfEnabled(): Promise<void> {
    if (!env.BOT_ENABLED) {
      logger.info("Bot is disabled");
      return;
    }

    await this.client.login(env.BOT_TOKEN);

    await new Promise<void>((resolve) => {
      if (this.client.isReady()) {
        resolve();
        return;
      }
      this.client.once("clientReady", () => resolve());
    });

    logger.info(`Logged in as ${this.client.user?.tag}`);

    const redisSubscriber = RedisSubscriberService.getInstance();

    try {
      await redisSubscriber.start();
    } catch (error) {
      logger.withError(error).error("Failed to start services");
      throw error;
    }
  }

  async run(): Promise<void> {
    await this.initializeMastra();
    this.startHttpServer();
    this.scheduleDocsIngest();
    if (env.BOT_ENABLED) {
      this.registerProcessTeardowns();
    }
    await this.startDiscordIfEnabled();
    if (env.BOT_ENABLED) {
      await this.initializeChat();
      logger.info("Bot is fully initialized and ready");
      HealthService.getInstance().markAsReady();
    }
  }
}
