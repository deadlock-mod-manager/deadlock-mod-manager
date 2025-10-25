import { Listener } from "@sapphire/framework";
import type { AnyThreadChannel, GuildMember } from "discord.js";
import { supportAgent } from "@/ai/agents/support";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "forum-thread-create-listener",
});

export class ForumThreadCreateListener extends Listener {
  private readonly excludedRoleIds: Set<string>;

  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
  ) {
    super(context, {
      ...options,
      event: "threadCreate",
    });

    this.excludedRoleIds = new Set([
      ...env.CORE_CONTRIBUTOR_ROLES,
      ...env.REPORT_MODERATOR_ROLES,
      ...env.BLACKLIST_MODERATOR_ROLES,
    ]);
  }

  private async shouldRespond(thread: AnyThreadChannel): Promise<boolean> {
    if (thread.parentId !== env.BUG_REPORT_CHANNEL_ID) {
      return false;
    }

    const starterMessage = await thread.fetchStarterMessage().catch(() => null);
    if (!starterMessage) {
      return false;
    }

    if (
      starterMessage.author.bot ||
      starterMessage.author.id === this.container.client.user?.id
    ) {
      return false;
    }

    const member = starterMessage.member as GuildMember | null;
    if (!member) {
      return false;
    }

    const userRoles = member.roles.cache;
    const hasExcludedRole = userRoles.some((role) =>
      this.excludedRoleIds.has(role.id),
    );

    if (hasExcludedRole) {
      logger
        .withMetadata({
          userId: starterMessage.author.id,
          threadId: thread.id,
        })
        .debug("Skipping thread from user with excluded role");
      return false;
    }

    return true;
  }

  public async run(thread: AnyThreadChannel) {
    if (!(await this.shouldRespond(thread))) {
      return;
    }

    const starterMessage = await thread.fetchStarterMessage();
    if (!starterMessage) {
      return;
    }

    await thread.sendTyping();

    const botId = this.container.client.user?.id;
    let cleanedContent = starterMessage.content;

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

    const threadId = thread.id;
    const sessionId = `${starterMessage.author.id}-${threadId}`;
    const userMention = `<@${starterMessage.author.id}>`;

    logger
      .withMetadata({
        messageId: starterMessage.id,
        userId: starterMessage.author.id,
        threadId,
        sessionId,
      })
      .info("Processing new forum thread for auto-reply");

    const response = await supportAgent.invoke(
      cleanedContent,
      sessionId,
      starterMessage.author.id,
      ["forum-auto-reply", "thread-create"],
      threadId,
      userMention,
    );

    await response.match(
      async (responseText) => {
        try {
          await starterMessage.reply({ content: responseText });

          logger
            .withMetadata({
              messageId: starterMessage.id,
              userId: starterMessage.author.id,
              threadId,
            })
            .info("Successfully sent forum thread auto-reply");
        } catch (replyError) {
          logger
            .withError(replyError)
            .withMetadata({ messageId: starterMessage.id, threadId })
            .error("Failed to send forum thread auto-reply");
        }
      },
      async (error) => {
        logger
          .withError(error)
          .withMetadata({
            messageId: starterMessage.id,
            userId: starterMessage.author.id,
            threadId,
          })
          .error("Support agent returned error for forum thread");

        try {
          await starterMessage.reply({
            content:
              "An error occurred while processing your request. Please try again later.",
          });
        } catch (replyError) {
          logger
            .withError(replyError)
            .withMetadata({ messageId: starterMessage.id, threadId })
            .error("Failed to send error reply in forum thread");
        }
      },
    );
  }
}
