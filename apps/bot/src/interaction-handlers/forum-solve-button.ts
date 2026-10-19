import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { type ButtonInteraction, GuildMember, MessageFlags } from "discord.js";
import { getForumConfig } from "@/config/forum-lifecycle";
import { logger as mainLogger } from "@/lib/logger";
import { hasForumModerationPermission } from "@/lib/permissions";
import { closeThread, SOLVE_BUTTON_ID } from "@/services/forum-lifecycle";

const logger = mainLogger.child().withContext({
  service: "forum-solve-button",
});

export class ForumSolveButtonHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options,
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button,
    });
  }

  public override parse(interaction: ButtonInteraction) {
    return interaction.customId === SOLVE_BUTTON_ID ? this.some() : this.none();
  }

  public async run(interaction: ButtonInteraction) {
    const thread = interaction.channel;
    const config = thread?.isThread() ? getForumConfig(thread.parentId) : null;
    if (!thread?.isThread() || !config) {
      return interaction.reply({
        content: "This button only works in a support forum post.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const isModerator =
      interaction.member instanceof GuildMember &&
      hasForumModerationPermission(interaction.member);
    if (interaction.user.id !== thread.ownerId && !isModerator) {
      return interaction.reply({
        content: "Only the person who opened this post can mark it as solved.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await closeThread(
        thread,
        config,
        "resolved",
        `Marked as solved by <@${interaction.user.id}>. Reply here to reopen it.`,
      );
      return interaction.editReply("Post closed as solved.");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ threadId: thread.id, userId: interaction.user.id })
        .error("Failed to mark forum post as solved");
      return interaction.editReply(
        "Could not close this post, try again later.",
      );
    }
  }
}
