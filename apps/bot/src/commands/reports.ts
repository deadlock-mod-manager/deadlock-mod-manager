import { ValidationError } from "@deadlock-mods/common";
import { db, ReportRepository } from "@deadlock-mods/database";
import { Command } from "@sapphire/framework";
import { escapeMarkdown, GuildMember, MessageFlags } from "discord.js";
import { logger as mainLogger } from "../lib/logger";
import { hasReportModerationPermission } from "../lib/permissions";
import { cache } from "../lib/redis";
import { reportCacheKeys } from "../lib/report-cache";
import { parseReportTarget, resolveReportTarget } from "../lib/report-target";

const logger = mainLogger.child().withContext({ service: "reports-command" });
const reportRepository = new ReportRepository(db);

export class ReportsCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("reports")
        .setDescription("Manage mod reports")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("clear")
            .setDescription("Clear all reports for a mod or author")
            .addStringOption((option) =>
              option
                .setName("target")
                .setDescription(
                  "GameBanana mod/sound URL or ID, member URL, or exact author name",
                )
                .setMaxLength(200)
                .setRequired(true),
            ),
        ),
    );
  }

  override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    if (
      !(interaction.member instanceof GuildMember) ||
      !hasReportModerationPermission(interaction.user, interaction.member)
    ) {
      return interaction.reply({
        content: "You don't have permission to clear mod reports.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const input = interaction.options.getString("target", true);
    await interaction.deferReply();
    try {
      const target = await resolveReportTarget(parseReportTarget(input));
      await reportRepository.backfillLegacyIdentities();
      const deleted = await reportRepository.clearForModeration(target);
      const label =
        target.kind === "author"
          ? `author **${escapeMarkdown(target.authorName)}**`
          : `${target.identity.submissionType} ID \`${target.identity.submissionId}\``;
      logger
        .withMetadata({
          userId: interaction.user.id,
          guildId: interaction.guildId,
          target,
          deletedReportCount: deleted.length,
        })
        .info("Mod reports cleared");

      try {
        await cache.mdel(reportCacheKeys(deleted));
      } catch (error) {
        logger
          .withError(error)
          .withMetadata({ target })
          .error("Failed to invalidate report caches");
        return interaction.editReply({
          content: `Cleared ${deleted.length} report(s) for ${label}, but cached report counts could not be refreshed.`,
          allowedMentions: { parse: [] },
        });
      }
      return interaction.editReply({
        content: deleted.length
          ? `Cleared ${deleted.length} report(s) for ${label}.`
          : `No reports found for ${label}.`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ userId: interaction.user.id, input })
        .error("Failed to clear reports");
      return interaction.editReply({
        content:
          error instanceof ValidationError
            ? error.message
            : "Could not clear reports. Please try again later.",
        allowedMentions: { parse: [] },
      });
    }
  }
}
