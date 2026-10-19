import { Listener } from "@sapphire/framework";
import {
  ActionRowBuilder,
  type AnyThreadChannel,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { getForumConfig } from "@/config/forum-lifecycle";
import { logger as mainLogger } from "@/lib/logger";
import { SOLVE_BUTTON_ID, setThreadStatus } from "@/services/forum-lifecycle";

const logger = mainLogger.child().withContext({
  service: "forum-lifecycle-thread-create-listener",
});

export class ForumLifecycleThreadCreateListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
  ) {
    super(context, {
      ...options,
      event: "threadCreate",
    });
  }

  public async run(thread: AnyThreadChannel, newlyCreated: boolean) {
    const config = getForumConfig(thread.parentId);
    if (!config || !newlyCreated) {
      return;
    }

    try {
      await setThreadStatus(thread, config, "open");

      if (config.solveButton) {
        const solveButton = new ButtonBuilder()
          .setCustomId(SOLVE_BUTTON_ID)
          .setLabel("Mark as solved")
          .setStyle(ButtonStyle.Success);
        await thread.send({
          content: "Once this is fixed, press the button to close the post.",
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(solveButton),
          ],
        });
      }
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ threadId: thread.id, forumId: config.channelId })
        .error("Failed to set up new forum post");
    }
  }
}
