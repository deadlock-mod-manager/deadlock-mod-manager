import { createDiscordAdapter } from "@chat-adapter/discord";
import { createIoRedisState } from "@chat-adapter/state-ioredis";
import { redis } from "../lib/redis";
import { logger } from "../lib/logger";
import { Chat, Card, CardText as Text, Actions, Button, Divider } from "chat";
import { env } from "../lib/env";

export const chatBot = new Chat({
  userName: "Deadlock Mod Manager",
  adapters: {
    discord: createDiscordAdapter({
      logger: logger.child().withContext({
        service: "chat",
      }),
      botToken: env.BOT_TOKEN,
      applicationId: env.DISCORD_APPLICATION_ID,
      publicKey: env.DISCORD_PUBLIC_KEY,
    }),
  },
  state: createIoRedisState({
    client: redis,
    logger: logger.child().withContext({
      service: "chat-state",
    }),
  }),
});

chatBot.onNewMention(async (thread) => {
  await thread.subscribe();
  await thread.post(
    <Card title='Support'>
      <Text>Hi :wave:</Text>
      <Divider />
      <Actions>
        <Button id='escalate' style='danger'>
          Test Button
        </Button>
      </Actions>
    </Card>,
  );
});
