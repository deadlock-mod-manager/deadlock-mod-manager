import { createDiscordAdapter } from "@chat-adapter/discord";
import { createIoRedisState } from "@chat-adapter/state-ioredis";
import { Chat } from "chat";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
// import { ChatLoggerAdapter } from "./chat-logger";

const GATEWAY_LISTENER_MS = 24 * 60 * 60 * 1000;

export const chatBot = new Chat({
  userName: "Deadlock Mod Manager",
  logger: "silent",
  adapters: {
    discord: createDiscordAdapter({
      logger: logger.child().withContext({ service: "chat" }),
      botToken: env.BOT_TOKEN,
      applicationId: env.DISCORD_APPLICATION_ID,
      publicKey: env.DISCORD_PUBLIC_KEY,
    }),
  },
  state: createIoRedisState({
    client: redis,
    logger: logger.child().withContext({ service: "chat-state" }),
  }),
});

/**
 * Runs the Chat SDK Discord Gateway (messages/mentions) without forwarding
 * Gateway events to an HTTP URL. Restarts each segment after {@link GATEWAY_LISTENER_MS}
 * until `abortSignal` aborts (process shutdown).
 */
export function startSupportChatGateway(options: {
  abortSignal: AbortSignal;
}): void {
  const adapter = chatBot.getAdapter("discord");

  const waitUntil = (task: Promise<unknown>) => {
    void task
      .catch((err) => {
        logger
          .withError(err instanceof Error ? err : new Error(String(err)))
          .error("Discord Chat gateway listener failed");
      })
      .finally(() => {
        if (!options.abortSignal.aborted) {
          void kick();
        }
      });
  };

  const kick = async () => {
    await adapter.startGatewayListener(
      { waitUntil },
      GATEWAY_LISTENER_MS,
      options.abortSignal,
      undefined,
    );
  };

  void kick();
}

chatBot.onNewMention(async (thread) => {
  await thread.subscribe();
  await thread.post("sup");
});
