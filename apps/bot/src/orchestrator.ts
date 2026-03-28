import { Hono } from "hono";
import { cors } from "hono/cors";
import { createSupportChat, type SupportChat } from "@/ai/chat";
import {
  type MastraAppEnv,
  initializeMastra,
  scheduleDocsIngest as scheduleDocsIngestJob,
} from "@/ai/mastra";
import { container } from "@/container";
import { discordClient } from "@/discord/client";
import { RedisSubscriberService } from "@/events/redis-subscriber";
import { HealthService } from "@/health/health.service";
import healthRouter from "@/health/health.router";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import {
  createWideEvent,
  logger,
  loggerContext,
  wideEventContext,
} from "@/lib/logger";
import { ProcessManager } from "@/lib/process-manager";

export class Orchestrator {
  private readonly app: Hono<MastraAppEnv>;
  private readonly processManager: ProcessManager;
  private readonly client = discordClient;
  private readonly supportChatGatewayAbort = new AbortController();
  private supportChat: SupportChat | null = null;
  private disconnectAllMcps: (() => Promise<void>) | null = null;

  constructor() {
    this.processManager = container.resolve(ProcessManager);
    this.app = new Hono<MastraAppEnv>();
    this.app.use(
      "*",
      cors({
        origin: env.TRUSTED_ORIGINS,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        credentials: true,
      }),
    );
    this.app.use("*", async (c, next) => {
      const requestId = crypto.randomUUID();
      const wide = createWideEvent(logger, "http_request", {
        method: c.req.method,
        path: c.req.path,
        requestId,
      });

      await loggerContext.storage.run({ requestId }, () =>
        wideEventContext.run(wide, () =>
          (async () => {
            try {
              await next();
              wide.set("statusCode", c.res.status);
              wide.emit("success");
            } catch (error) {
              wide.set("statusCode", 500);
              wide.emit(
                "error",
                error instanceof Error ? error : new Error(String(error)),
              );
              throw error;
            }
          })(),
        ),
      );
    });
    this.app.route("/", healthRouter);
  }

  startHttpServer(): void {
    logger.info(`Starting HTTP server on port ${env.PORT}`);
    Bun.serve({
      port: env.PORT,
      fetch: this.app.fetch,
    });
  }

  private registerProcessTeardowns(): void {
    const redisSubscriber = container.resolve(RedisSubscriberService);

    this.processManager.registerTeardown("redis-subscriber", () =>
      redisSubscriber.stop(),
    );
    this.processManager.registerTeardown("chat-discord-gateway", () => {
      this.supportChatGatewayAbort.abort();
    });
    this.processManager.registerTeardown("chat", () => {
      this.supportChat?.chatBot.shutdown();
    });
    this.processManager.registerTeardown("mastra-mcps", () =>
      this.disconnectAllMcps?.(),
    );
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

    const redisSubscriber = container.resolve(RedisSubscriberService);

    try {
      await redisSubscriber.start();
    } catch (error) {
      logger.withError(error).error("Failed to start services");
      throw error;
    }
  }

  async run(): Promise<void> {
    const { agent, disconnectAllMcps } = await initializeMastra(this.app);
    this.disconnectAllMcps = disconnectAllMcps;
    this.startHttpServer();
    scheduleDocsIngestJob();

    if (env.BOT_ENABLED) {
      this.supportChat = createSupportChat(agent);
      await this.startDiscordIfEnabled();
      await redis.connect();
      await this.supportChat.chatBot.initialize();
      this.supportChat.startSupportChatGateway({
        abortSignal: this.supportChatGatewayAbort.signal,
      });
    }

    this.registerProcessTeardowns();

    container.resolve(HealthService).markAsReady();
  }
}
