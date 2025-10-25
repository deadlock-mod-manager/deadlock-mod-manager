import { Listener } from "@sapphire/framework";
import type { Message, TextChannel } from "discord.js";
import { SupportAgent } from "@/ai/agents/support";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "message-listener",
});

export class MessageCreateListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
  ) {
    super(context, {
      ...options,
      event: "messageCreate",
    });
  }

  public async shouldRespond(message: Message) {
    if (
      message.author.bot ||
      message.author.id === this.container.client.user?.id
    ) {
      return false;
    }

    if (message.mentions.has(this.container.client.user?.id || "")) {
      return true;
    }

    return false;
  }

  public async run(message: Message) {
    if (!(await this.shouldRespond(message))) {
      return;
    }

    await (message.channel as TextChannel).sendTyping();

    const botId = this.container.client.user?.id;
    let cleanedContent = message.content;

    if (botId) {
      cleanedContent = cleanedContent
        .replace(new RegExp(`<@!?${botId}>`, "g"), "")
        .trim();
    }

    cleanedContent = cleanedContent
      .replace(/<@&\d+>/g, "")
      .replace(/<#\d+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const sessionId = `${message.author.id}-${message.channelId}`;
    const userMention = `<@${message.author.id}>`;
    const supportAgent = new SupportAgent();
    const response = await supportAgent.invoke(
      cleanedContent,
      sessionId,
      message.author.id,
      ["support"],
      message.channelId,
      userMention,
    );

    await response.match(
      async (responseText) => {
        try {
          await message.reply({ content: responseText });

          logger
            .withMetadata({
              messageId: message.id,
              userId: message.author.id,
              channelId: message.channelId,
            })
            .info("Successfully processed support message");
        } catch (replyError) {
          logger
            .withError(replyError)
            .withMetadata({ messageId: message.id })
            .error("Failed to send success reply to user");
        }
      },
      async (error) => {
        logger
          .withError(error)
          .withMetadata({
            messageId: message.id,
            userId: message.author.id,
            channelId: message.channelId,
          })
          .error("Support agent returned error");

        try {
          await message.reply({
            content:
              "An error occurred while processing your request. Please try again later.",
          });
        } catch (replyError) {
          logger
            .withError(replyError)
            .withMetadata({ messageId: message.id })
            .error("Failed to send error reply to user");
        }
      },
    );
  }
}
