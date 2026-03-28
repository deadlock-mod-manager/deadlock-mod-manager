import { createMastra, ingestDocs } from "@deadlock-mods/ai";
import {
  MastraServer,
  type HonoBindings,
  type HonoVariables,
} from "@mastra/hono";
import type { SapphireClient } from "@sapphire/framework";
import type { Hono } from "hono";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ProcessManager } from "@/lib/process-manager";
import { BotStartupService } from "@/services/bot-startup";
import { HealthService } from "@/services/health";
import { RedisSubscriberService } from "@/services/redis-subscriber";

export type AppEnv = { Bindings: HonoBindings; Variables: HonoVariables };

export class BotApplication {
  constructor(
    private readonly app: Hono<AppEnv>,
    private readonly client: SapphireClient,
  ) {}

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

  async startDiscordIfEnabled(): Promise<void> {
    if (!env.BOT_ENABLED) {
      logger.info("Bot is disabled");
      return;
    }

    const startupService = new BotStartupService();
    await startupService.initialize(this.client);

    const redisSubscriber = RedisSubscriberService.getInstance();
    const healthService = HealthService.getInstance();

    const processManager = new ProcessManager();
    processManager.setClient(this.client);
    processManager.registerShutdownHandler(redisSubscriber);
    processManager.setupSignalHandlers();

    this.client.once("clientReady", async () => {
      logger.info(`Logged in as ${this.client.user?.tag}`);

      try {
        await redisSubscriber.start();
        logger.info("Bot is fully initialized and ready");
        healthService.markAsReady();
      } catch (error) {
        logger.withError(error).error("Failed to start services");
      }
    });
  }

  async run(): Promise<void> {
    await this.initializeMastra();
    this.startHttpServer();
    this.scheduleDocsIngest();
    await this.startDiscordIfEnabled();
  }
}
