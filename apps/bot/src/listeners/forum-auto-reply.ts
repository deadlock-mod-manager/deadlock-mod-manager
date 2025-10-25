import { Listener } from "@sapphire/framework";
import type { Message, TextChannel } from "discord.js";
import { supportAgent } from "@/ai/agents/support";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "forum-auto-reply-listener",
});

export class ForumAutoReplyListener extends Listener {
  private readonly excludedRoleIds: Set<string>;

  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
  ) {
    super(context, {
      ...options,
      event: "messageCreate",
    });

    this.excludedRoleIds = new Set([
      ...env.CORE_CONTRIBUTOR_ROLES,
      ...env.REPORT_MODERATOR_ROLES,
      ...env.BLACKLIST_MODERATOR_ROLES,
    ]);
  }

  private async shouldRespond(message: Message): Promise<boolean> {
    if (
      message.author.bot ||
      message.author.id === this.container.client.user?.id
    ) {
      return false;
    }

    if (!message.channel.isThread()) {
      return false;
    }

    if (message.channel.parentId !== env.BUG_REPORT_CHANNEL_ID) {
      return false;
    }

    if (!message.member) {
      return false;
    }

    const userRoles = message.member.roles.cache;
    const hasExcludedRole = userRoles.some((role) =>
      this.excludedRoleIds.has(role.id),
    );

    if (hasExcludedRole) {
      logger
        .withMetadata({
          userId: message.author.id,
          messageId: message.id,
          threadId: message.channel.id,
        })
        .debug("Skipping message from user with excluded role");
      return false;
    }

    return true;
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

    const threadId = message.channel.id;
    const sessionId = `${message.author.id}-${threadId}`;
    const userMention = `<@${message.author.id}>`;

    logger
      .withMetadata({
        messageId: message.id,
        userId: message.author.id,
        threadId,
        sessionId,
      })
      .info("Processing forum message for auto-reply");

    const response = await supportAgent.invoke(
      cleanedContent,
      sessionId,
      message.author.id,
      ["forum-auto-reply"],
      threadId,
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
              threadId,
            })
            .info("Successfully sent forum auto-reply");
        } catch (replyError) {
          logger
            .withError(replyError)
            .withMetadata({ messageId: message.id, threadId })
            .error("Failed to send forum auto-reply");
        }
      },
      async (error) => {
        logger
          .withError(error)
          .withMetadata({
            messageId: message.id,
            userId: message.author.id,
            threadId,
          })
          .error("Support agent returned error for forum message");

        try {
          await message.reply({
            content:
              "An error occurred while processing your request. Please try again later.",
          });
        } catch (replyError) {
          logger
            .withError(replyError)
            .withMetadata({ messageId: message.id, threadId })
            .error("Failed to send error reply in forum");
        }
      },
    );
  }
}
