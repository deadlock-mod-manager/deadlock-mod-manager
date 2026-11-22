import { Listener } from "@sapphire/framework";
import type { Message } from "discord.js";
import { getForumConfig } from "@/config/forum-lifecycle";
import { getStatus, isClosedStatus } from "@/lib/forum-status";
import { logger as mainLogger } from "@/lib/logger";
import { hasForumModerationPermission } from "@/lib/permissions";
import { setThreadStatus } from "@/services/forum-lifecycle";

const logger = mainLogger.child().withContext({
  service: "forum-lifecycle-messages-listener",
});

/** Reopens a closed post when its author replies, and marks staff replies on open posts. */
export class ForumLifecycleMessagesListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
  ) {
    super(context, {
      ...options,
      event: "messageCreate",
    });
  }

  public async run(message: Message) {
    const thread = message.channel;
    if (message.author.bot || !thread.isThread()) {
      return;
    }
    const config = getForumConfig(thread.parentId);
    if (!config) {
      return;
    }

    const status = getStatus(config, thread.appliedTags);
    let nextStatus: "open" | "inProgress" | null = null;
    if (message.author.id === thread.ownerId) {
      nextStatus = isClosedStatus(config, status) ? "open" : null;
    } else if (
      status === "open" &&
      config.statusTags.inProgress &&
      message.member &&
      hasForumModerationPermission(message.member)
    ) {
      nextStatus = "inProgress";
    }
    if (!nextStatus) {
      return;
    }

    try {
      await setThreadStatus(thread, config, nextStatus);
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ threadId: thread.id, nextStatus })
        .error("Failed to update forum post status");
    }
  }
}
