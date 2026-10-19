import {
  type AnyThreadChannel,
  ChannelFlags,
  type Client,
  DiscordAPIError,
  RESTJSONErrorCodes,
  SnowflakeUtil,
} from "discord.js";
import { getForumConfig, managedForums } from "@/config/forum-lifecycle";
import { env } from "@/lib/env";
import {
  type ForumLifecycleConfig,
  type ForumStatus,
  IDLE_CLOSE_DAYS,
  planSweepAction,
  type SweepAction,
  withStatus,
} from "@/lib/forum-status";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "forum-lifecycle",
});

export const SOLVE_BUTTON_ID = "forum-lifecycle:solve";

export async function setThreadStatus(
  thread: AnyThreadChannel,
  config: ForumLifecycleConfig,
  status: ForumStatus,
): Promise<void> {
  await thread.setAppliedTags(withStatus(config, thread.appliedTags, status));
}

/** Posts `note`, sets the status tag and archives. Archiving last keeps the note from reopening the thread. */
export async function closeThread(
  thread: AnyThreadChannel,
  config: ForumLifecycleConfig,
  status: ForumStatus,
  note: string,
): Promise<void> {
  await thread.send({ content: note, allowedMentions: { parse: [] } });
  await setThreadStatus(thread, config, status);
  await thread.setArchived(true);
}

async function isStarterDeleted(thread: AnyThreadChannel): Promise<boolean> {
  try {
    await thread.fetchStarterMessage();
    return false;
  } catch (error) {
    return (
      error instanceof DiscordAPIError &&
      error.code === RESTJSONErrorCodes.UnknownMessage
    );
  }
}

async function applySweepAction(
  thread: AnyThreadChannel,
  config: ForumLifecycleConfig,
  action: SweepAction,
): Promise<void> {
  switch (action) {
    case "tagOpen":
      await setThreadStatus(thread, config, "open");
      return;
    case "archive":
      await thread.setArchived(true);
      return;
    case "closeIdle":
      await closeThread(
        thread,
        config,
        config.idleCloseStatus,
        `Closing this post after ${IDLE_CLOSE_DAYS} days without activity. Reply here to reopen it.`,
      );
      return;
    case "closeDeleted":
      await closeThread(
        thread,
        config,
        config.idleCloseStatus,
        "Closing this post because its original message was deleted.",
      );
      return;
    case "none":
      return;
  }
}

export async function sweepForums(client: Client): Promise<void> {
  const guild = await client.guilds.fetch(env.DMM_GUILD_ID);
  const { threads } = await guild.channels.fetchActiveThreads();
  const now = Date.now();
  const counts = {
    none: 0,
    tagOpen: 0,
    archive: 0,
    closeIdle: 0,
    closeDeleted: 0,
  } satisfies Record<SweepAction, number>;
  let failed = 0;

  for (const thread of threads.values()) {
    const config = getForumConfig(thread.parentId);
    if (!config || thread.flags.has(ChannelFlags.Pinned)) {
      continue;
    }

    const action = planSweepAction(
      config,
      {
        appliedTags: thread.appliedTags,
        lastActivityAt: thread.lastMessageId
          ? SnowflakeUtil.timestampFrom(thread.lastMessageId)
          : (thread.createdTimestamp ?? now),
        starterDeleted: await isStarterDeleted(thread),
      },
      now,
    );
    counts[action]++;
    if (action === "none") {
      continue;
    }

    try {
      await applySweepAction(thread, config, action);
    } catch (error) {
      failed++;
      logger
        .withError(error)
        .withMetadata({
          threadId: thread.id,
          threadName: thread.name,
          forumId: config.channelId,
          action,
        })
        .error("Forum cleanup action failed");
    }
  }

  logger
    .withMetadata({
      forums: managedForums.map((forum) => forum.channelId),
      ...counts,
      failed,
    })
    .info("Forum cleanup sweep finished");
}
