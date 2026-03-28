import { ingestKbMessage } from "@deadlock-mods/ai";
import { Listener } from "@sapphire/framework";
import type { Message } from "discord.js";
import { discordConfig } from "@/discord/config";
import { env } from "@/lib/env";
import { runWithWideEvent, logger, wideEventContext } from "@/lib/logger";

export class KbChannelListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
  ) {
    super(context, {
      ...options,
      event: "messageCreate",
    });
  }

  private shouldProcess(message: Message): boolean {
    if (message.author.bot) return false;
    if (message.channelId !== discordConfig.kbChannelId) return false;
    if (!message.content || message.content.trim().length < 20) return false;
    return true;
  }

  public async run(message: Message) {
    if (!this.shouldProcess(message)) return;

    await runWithWideEvent(
      wideEventContext,
      logger,
      "kb_ingest",
      {
        service: "kb-channel-listener",
        userId: message.author.id,
        channelId: message.channelId,
        messageId: message.id,
      },
      async (wide) => {
        try {
          await ingestKbMessage(env, message.content, {
            messageId: message.id,
            authorId: message.author.id,
            channelId: message.channelId,
            timestamp: message.createdAt.toISOString(),
          });
          wide.merge({ kbIngestOutcome: "ingested" });
        } catch (caught) {
          const error =
            caught instanceof Error ? caught : new Error(String(caught));
          wide.merge({ kbIngestOutcome: "failed" });
          logger.withError(error).error("KB message ingestion failed");
        }
      },
    );
  }
}
