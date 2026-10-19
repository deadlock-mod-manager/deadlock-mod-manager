import { Command } from "@sapphire/framework";
import { ChannelType, GuildMember, MessageFlags } from "discord.js";
import { getForumConfig } from "@/config/forum-lifecycle";
import { env } from "@/lib/env";
import { type ForumStatus, isClosedStatus } from "@/lib/forum-status";
import { logger as mainLogger } from "@/lib/logger";
import { hasForumModerationPermission } from "@/lib/permissions";
import { ForumCleanupProcessor } from "@/processors/forum-cleanup.processor";
import { cronService } from "@/services/cron";
import { closeThread } from "@/services/forum-lifecycle";

const logger = mainLogger.child().withContext({
  service: "forum-command",
});

const closeReasonLabels = {
  resolved: "Resolved",
  duplicate: "Duplicate",
  wontFix: "Won't fix",
  planned: "Planned",
  declined: "Declined",
} satisfies Partial<Record<ForumStatus, string>>;

type CloseReason = keyof typeof closeReasonLabels;
const closeReasons = Object.keys(closeReasonLabels) as CloseReason[];

export class ForumCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("forum")
        .setDescription("Manage support forum posts")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("cleanup")
            .setDescription("Run the scheduled forum cleanup now"),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("close")
            .setDescription("Close this forum post")
            .addStringOption((option) =>
              option
                .setName("reason")
                .setDescription("Why the post is closed")
                .setRequired(true)
                .addChoices(
                  ...closeReasons.map((reason) => ({
                    name: closeReasonLabels[reason],
                    value: reason,
                  })),
                ),
            )
            .addChannelOption((option) =>
              option
                .setName("duplicate_of")
                .setDescription("The post this one duplicates")
                .addChannelTypes(ChannelType.PublicThread),
            ),
        ),
    );
  }

  override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    if (
      !(interaction.member instanceof GuildMember) ||
      !hasForumModerationPermission(interaction.member)
    ) {
      return interaction.reply({
        content: "You don't have permission to manage forum posts.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.options.getSubcommand() === "cleanup") {
      if (interaction.guildId !== env.DMM_GUILD_ID) {
        return interaction.reply({
          content: "Run forum cleanup in the Deadlock Mod Manager server.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply();
      try {
        const jobId = await cronService.triggerJob(ForumCleanupProcessor.name, {
          requestedBy: interaction.user.id,
        });
        logger
          .withMetadata({ userId: interaction.user.id, jobId })
          .info("Forum cleanup requested");
        return interaction.editReply(
          "Forum cleanup queued for bug reports and suggestions. The usual cleanup rules apply.",
        );
      } catch (error) {
        logger.withError(error).error("Failed to queue forum cleanup");
        return interaction.editReply(
          "Could not queue forum cleanup, try again later.",
        );
      }
    }

    const thread = interaction.channel;
    const config = thread?.isThread() ? getForumConfig(thread.parentId) : null;
    if (!thread?.isThread() || !config) {
      return interaction.reply({
        content: "Run this command inside a bug report or suggestion post.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const status = interaction.options.getString("reason", true) as CloseReason;
    if (!isClosedStatus(config, status)) {
      const allowed = closeReasons
        .filter((reason) => isClosedStatus(config, reason))
        .map((reason) => closeReasonLabels[reason])
        .join(", ");
      return interaction.reply({
        content: `That reason doesn't apply to this forum. Use one of: ${allowed}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const duplicateOf = interaction.options.getChannel("duplicate_of");
    const note =
      status === "duplicate" && duplicateOf
        ? `Closed as a duplicate of <#${duplicateOf.id}>. Follow that post for updates.`
        : `Closed as ${closeReasonLabels[status].toLowerCase()} by <@${interaction.user.id}>.`;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await closeThread(thread, config, status, note);
      return interaction.editReply("Post closed.");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ threadId: thread.id, status })
        .error("Failed to close forum post");
      return interaction.editReply(
        "Could not close this post, try again later.",
      );
    }
  }
}
