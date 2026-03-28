import { db, ModRepository, ReportRepository } from "@deadlock-mods/database";
import { Listener } from "@sapphire/framework";
import type {
  ButtonInteraction,
  Interaction,
  ModalSubmitInteraction,
} from "discord.js";
import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { container } from "tsyringe";
import {
  getRequiredRolesDisplay,
  hasReportModerationPermission,
} from "@/discord/permissions";
import { logger as mainLogger } from "@/lib/logger";
import { ReportEventPublisherService } from "@/reports/report-event-publisher.service";

const logger = mainLogger.child().withContext({
  service: "interaction-listener",
});

export class ReportInteractionListener extends Listener {
  private readonly reportRepository: ReportRepository;
  private readonly modRepository: ModRepository;
  private readonly reportPublisher: ReportEventPublisherService;

  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: "interactionCreate",
    });

    this.reportRepository = new ReportRepository(db);
    this.modRepository = new ModRepository(db);
    this.reportPublisher = container.resolve(ReportEventPublisherService);
  }

  public async run(interaction: Interaction) {
    try {
      if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.handleModalSubmit(interaction);
      }
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          interactionType: interaction.type,
          userId: interaction.user?.id,
          guildId: interaction.guildId,
        })
        .error("Failed to handle interaction");
    }
  }

  private async handleButtonInteraction(interaction: ButtonInteraction) {
    const { customId } = interaction;

    logger
      .withMetadata({
        customId,
        userId: interaction.user.id,
        username: interaction.user.username,
      })
      .debug("Handling button interaction");

    if (
      customId.startsWith("verify_report:") ||
      customId.startsWith("dismiss_report:")
    ) {
      await this.handleReportInteraction(interaction);
      return;
    }

    logger.withMetadata({ customId }).warn("Unhandled button interaction");
  }

  private async handleModalSubmit(interaction: ModalSubmitInteraction) {
    const { customId } = interaction;

    logger
      .withMetadata({
        customId,
        userId: interaction.user.id,
        username: interaction.user.username,
      })
      .debug("Handling modal submit interaction");

    if (customId.startsWith("dismiss_modal:")) {
      const reportId = customId.split(":")[1];
      await this.handleDismissModal(interaction, reportId);
      return;
    }

    logger
      .withMetadata({ customId })
      .warn("Unhandled modal submit interaction");
  }

  private async handleReportInteraction(interaction: ButtonInteraction) {
    if (
      !interaction.customId.startsWith("verify_report:") &&
      !interaction.customId.startsWith("dismiss_report:")
    ) {
      return;
    }

    const [action, reportId] = interaction.customId.split(":");

    logger
      .withMetadata({
        action,
        reportId,
        userId: interaction.user.id,
        username: interaction.user.username,
      })
      .info("Processing report interaction");

    const member =
      interaction.guild?.members.cache.get(interaction.user.id) || null;
    if (!hasReportModerationPermission(interaction.user, member)) {
      logger
        .withMetadata({
          action,
          reportId,
          userId: interaction.user.id,
          username: interaction.user.username,
        })
        .warn("User attempted report moderation without required permissions");

      await interaction.reply({
        content: `❌ You don't have permission to moderate reports. Required roles: ${getRequiredRolesDisplay()}`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    try {
      const report = await this.reportRepository.findById(reportId);
      if (!report) {
        await interaction.reply({
          content: "❌ Report not found.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (report.status !== "unverified") {
        await interaction.reply({
          content: `❌ This report has already been ${report.status}.`,
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (action === "verify_report") {
        await this.handleVerifyReport(interaction, reportId);
      } else if (action === "dismiss_report") {
        await this.handleDismissReport(interaction, reportId);
      }
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          action,
          reportId,
          userId: interaction.user.id,
        })
        .error("Failed to process report interaction");

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred while processing your request.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
  }

  private async handleVerifyReport(
    interaction: ButtonInteraction,
    reportId: string,
  ) {
    try {
      const updatedReport = await this.reportRepository.updateStatus(
        reportId,
        "verified",
        {
          verifiedBy: `${interaction.user.username} (${interaction.user.id})`,
        },
      );

      if (!updatedReport) {
        throw new Error("Failed to update report status");
      }

      const mod = await this.modRepository.findById(updatedReport.modId);
      if (!mod) {
        throw new Error("Mod not found for report");
      }

      await this.reportPublisher.publishReportStatusUpdatedEvent(
        updatedReport,
        mod,
      );

      await interaction.reply({
        content: "✅ Report has been verified successfully.",
        flags: [MessageFlags.Ephemeral],
      });

      logger
        .withMetadata({
          reportId,
          verifiedBy: interaction.user.username,
          userId: interaction.user.id,
        })
        .info("Report verified successfully");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          reportId,
          userId: interaction.user.id,
        })
        .error("Failed to verify report");

      await interaction.reply({
        content: "❌ Failed to verify report. Please try again.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }

  private async handleDismissReport(
    interaction: ButtonInteraction,
    reportId: string,
  ) {
    const modal = new ModalBuilder()
      .setCustomId(`dismiss_modal:${reportId}`)
      .setTitle("Dismiss Report");

    const reasonInput = new TextInputBuilder()
      .setCustomId("dismissal_reason")
      .setLabel("Reason for dismissal")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Please provide a reason for dismissing this report...")
      .setRequired(true)
      .setMaxLength(500);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      reasonInput,
    );
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }

  private async handleDismissModal(
    interaction: ModalSubmitInteraction,
    reportId: string,
  ) {
    const member =
      interaction.guild?.members.cache.get(interaction.user.id) || null;
    if (!hasReportModerationPermission(interaction.user, member)) {
      logger
        .withMetadata({
          reportId,
          userId: interaction.user.id,
          username: interaction.user.username,
        })
        .warn("User attempted report dismissal without required permissions");

      await interaction.reply({
        content: `❌ You don't have permission to moderate reports. Required roles: ${getRequiredRolesDisplay()}`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const dismissalReason =
      interaction.fields.getTextInputValue("dismissal_reason");

    try {
      const updatedReport = await this.reportRepository.updateStatus(
        reportId,
        "dismissed",
        {
          dismissedBy: `${interaction.user.username} (${interaction.user.id})`,
          dismissalReason,
        },
      );

      if (!updatedReport) {
        throw new Error("Failed to update report status");
      }

      const mod = await this.modRepository.findById(updatedReport.modId);
      if (!mod) {
        throw new Error("Mod not found for report");
      }

      await this.reportPublisher.publishReportStatusUpdatedEvent(
        updatedReport,
        mod,
      );

      await interaction.reply({
        content: "✅ Report has been dismissed successfully.",
        flags: [MessageFlags.Ephemeral],
      });

      logger
        .withMetadata({
          reportId,
          dismissedBy: interaction.user.username,
          userId: interaction.user.id,
          dismissalReason,
        })
        .info("Report dismissed successfully");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          reportId,
          userId: interaction.user.id,
        })
        .error("Failed to dismiss report");

      await interaction.reply({
        content: "❌ Failed to dismiss report. Please try again.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
}
