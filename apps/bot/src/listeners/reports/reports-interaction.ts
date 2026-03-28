import { db, ModRepository, ReportRepository } from "@deadlock-mods/database";
import { Listener } from "@sapphire/framework";
import type {
  ButtonInteraction,
  Interaction,
  ModalSubmitInteraction,
} from "discord.js";
import {
  ActionRowBuilder,
  GuildMember,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { WideEvent } from "@deadlock-mods/logging";
import { container } from "tsyringe";
import { markSupportThreadEscalated } from "@/ai/support-thread-state";
import { discordConfig } from "@/discord/config";
import {
  getRequiredRolesDisplay,
  hasReportModerationPermission,
} from "@/discord/permissions";
import { logger, runWithWideEvent, wideEventContext } from "@/lib/logger";
import { ReportEventPublisherService } from "@/reports/report-event-publisher.service";

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
    await runWithWideEvent(
      wideEventContext,
      logger,
      "discord_interaction",
      {
        service: "interaction-listener",
        interactionType: interaction.type,
        userId: interaction.user?.id,
        guildId: interaction.guildId,
      },
      async (wide) => {
        if (interaction.isButton()) {
          await this.handleButtonInteraction(interaction, wide);
        } else if (interaction.isModalSubmit()) {
          await this.handleModalSubmit(interaction, wide);
        } else {
          wide.merge({ interactionOutcome: "ignored_type" });
        }
      },
    );
  }

  private async handleButtonInteraction(
    interaction: ButtonInteraction,
    wide: WideEvent,
  ) {
    const { customId } = interaction;

    wide.merge({
      customId,
      userId: interaction.user.id,
      username: interaction.user.username,
    });

    if (
      customId.startsWith("verify_report:") ||
      customId.startsWith("dismiss_report:")
    ) {
      await this.handleReportInteraction(interaction, wide);
      return;
    }

    if (customId === "escalate") {
      await this.handleEscalation(interaction, wide);
      return;
    }

    wide.merge({ interactionOutcome: "unhandled_button" });
  }

  private async handleModalSubmit(
    interaction: ModalSubmitInteraction,
    wide: WideEvent,
  ) {
    const { customId } = interaction;

    wide.merge({
      customId,
      userId: interaction.user.id,
      username: interaction.user.username,
    });

    if (customId.startsWith("dismiss_modal:")) {
      const reportId = customId.split(":")[1];
      await this.handleDismissModal(interaction, reportId, wide);
      return;
    }

    wide.merge({ interactionOutcome: "unhandled_modal" });
  }

  private async handleEscalation(
    interaction: ButtonInteraction,
    wide: WideEvent,
  ) {
    if (!interaction.channel?.isThread()) {
      wide.merge({ interactionOutcome: "escalate_not_in_thread" });
      await interaction.reply({
        content: "Escalation is only available in support threads.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const threadId = interaction.channel.id;
    await markSupportThreadEscalated(threadId);

    const displayName =
      interaction.member instanceof GuildMember
        ? interaction.member.displayName
        : interaction.user.username;

    const supportMentions = discordConfig.supportRoles
      .map((roleId) => `<@&${roleId}>`)
      .join(" ");

    await interaction.reply({
      content: `${displayName} requested help from the support team. ${supportMentions}, please take a look.`,
    });

    wide.merge({ interactionOutcome: "escalated" });
  }

  private async handleReportInteraction(
    interaction: ButtonInteraction,
    wide: WideEvent,
  ) {
    if (
      !interaction.customId.startsWith("verify_report:") &&
      !interaction.customId.startsWith("dismiss_report:")
    ) {
      return;
    }

    const [action, reportId] = interaction.customId.split(":");

    wide.merge({
      reportAction: action,
      reportId,
    });

    const member =
      interaction.guild?.members.cache.get(interaction.user.id) || null;
    if (!hasReportModerationPermission(interaction.user, member)) {
      wide.merge({ interactionOutcome: "denied_report_moderation" });

      await interaction.reply({
        content: `❌ You don't have permission to moderate reports. Required roles: ${getRequiredRolesDisplay()}`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    try {
      const report = await this.reportRepository.findById(reportId);
      if (!report) {
        wide.merge({ interactionOutcome: "report_not_found" });
        await interaction.reply({
          content: "❌ Report not found.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (report.status !== "unverified") {
        wide.merge({
          interactionOutcome: "report_already_processed",
          status: report.status,
        });
        await interaction.reply({
          content: `❌ This report has already been ${report.status}.`,
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (action === "verify_report") {
        await this.handleVerifyReport(interaction, reportId, wide);
      } else if (action === "dismiss_report") {
        await this.handleDismissReport(interaction, reportId);
      }
    } catch (error) {
      wide.merge({ interactionOutcome: "report_interaction_error" });

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred while processing your request.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      throw error;
    }
  }

  private async handleVerifyReport(
    interaction: ButtonInteraction,
    reportId: string,
    wide: WideEvent,
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

      wide.merge({
        interactionOutcome: "report_verified",
        reportId,
        verifiedBy: interaction.user.username,
      });
    } catch (error) {
      wide.merge({ interactionOutcome: "verify_report_failed", reportId });

      await interaction.reply({
        content: "❌ Failed to verify report. Please try again.",
        flags: [MessageFlags.Ephemeral],
      });
      throw error;
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
    wide: WideEvent,
  ) {
    const member =
      interaction.guild?.members.cache.get(interaction.user.id) || null;
    if (!hasReportModerationPermission(interaction.user, member)) {
      wide.merge({ interactionOutcome: "denied_dismiss_moderation" });

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

      wide.merge({
        interactionOutcome: "report_dismissed",
        reportId,
        dismissedBy: interaction.user.username,
        dismissalReason,
      });
    } catch (error) {
      wide.merge({ interactionOutcome: "dismiss_report_failed", reportId });

      await interaction.reply({
        content: "❌ Failed to dismiss report. Please try again.",
        flags: [MessageFlags.Ephemeral],
      });
      throw error;
    }
  }
}
