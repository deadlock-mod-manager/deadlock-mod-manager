import { db, ModRepository, ReportRepository } from "@deadlock-mods/database";
import type {
  NewReportEvent,
  ReportStatusUpdatedEvent,
} from "@deadlock-mods/shared";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type ForumChannel,
  type GuildForumTag,
} from "discord.js";
import client from "@/lib/discord";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "report-poster",
});

export class ReportPosterService {
  private static instance: ReportPosterService | null = null;
  private readonly reportRepository: ReportRepository;
  private readonly modRepository: ModRepository;

  private constructor() {
    this.reportRepository = new ReportRepository(db);
    this.modRepository = new ModRepository(db);
  }

  static getInstance(): ReportPosterService {
    if (!ReportPosterService.instance) {
      ReportPosterService.instance = new ReportPosterService();
    }
    return ReportPosterService.instance;
  }

  async postNewReport(event: NewReportEvent): Promise<void> {
    try {
      if (!env.REPORTS_CHANNEL_ID) {
        logger.warn("REPORTS_CHANNEL_ID not configured, skipping Discord post");
        return;
      }

      // Check if this report already has a Discord thread to prevent duplicates
      const existingReport = await this.reportRepository.findById(
        event.data.id,
      );
      if (existingReport?.discordMessageId) {
        logger
          .withMetadata({
            reportId: event.data.id,
            existingThreadId: existingReport.discordMessageId,
          })
          .warn(
            "Report already has Discord thread, skipping duplicate creation",
          );
        return;
      }

      logger
        .withMetadata({
          reportId: event.data.id,
          modName: event.data.modName,
          reportType: event.data.type,
          channelId: env.REPORTS_CHANNEL_ID,
        })
        .info("Posting new report to Discord channel");

      const channel = await client.channels.fetch(env.REPORTS_CHANNEL_ID);

      if (!channel) {
        throw new Error(`Channel with ID ${env.REPORTS_CHANNEL_ID} not found`);
      }

      if (channel.type !== ChannelType.GuildForum) {
        throw new Error(
          `Channel ${env.REPORTS_CHANNEL_ID} is not a forum channel (type: ${channel.type})`,
        );
      }

      // Fetch mod data to get the correct URL
      const mod = await this.modRepository.findById(event.data.modId);
      if (!mod) {
        throw new Error(`Mod with ID ${event.data.modId} not found`);
      }

      const { embed, components } = this.formatReportPost(
        event.data,
        mod.remoteUrl,
      );
      const forumChannel = channel as ForumChannel;
      const threadTitle = `${this.getReportTypeEmoji(event.data.type)} ${event.data.modName} - ${event.data.type}`;
      const availableTags = this.getApplicableTags(forumChannel, event.data);

      const thread = await forumChannel.threads.create({
        name: threadTitle,
        appliedTags: availableTags,
        message: {
          embeds: [embed],
          components,
        },
      });

      // Store Discord thread ID for future updates
      await this.reportRepository.updateDiscordMessageId(
        event.data.id,
        thread.id,
      );

      logger
        .withMetadata({
          reportId: event.data.id,
          threadId: thread.id,
          modName: event.data.modName,
        })
        .info("Successfully posted new report to Discord");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          reportId: event.data.id,
          modName: event.data.modName,
        })
        .error("Failed to post new report to Discord");
      throw error;
    }
  }

  async updateReportStatus(event: ReportStatusUpdatedEvent): Promise<void> {
    try {
      if (!env.REPORTS_CHANNEL_ID) {
        logger.warn(
          "REPORTS_CHANNEL_ID not configured, skipping Discord update",
        );
        return;
      }

      logger
        .withMetadata({
          reportId: event.data.id,
          newStatus: event.data.status,
          modName: event.data.modName,
        })
        .info("Updating report status in Discord");

      const report = await this.reportRepository.findById(event.data.id);
      if (!report || !report.discordMessageId) {
        logger
          .withMetadata({ reportId: event.data.id })
          .warn("Report not found or no Discord thread ID, skipping update");
        return;
      }

      const channel = await client.channels.fetch(env.REPORTS_CHANNEL_ID);
      if (!channel || channel.type !== ChannelType.GuildForum) {
        throw new Error(`Invalid channel: ${env.REPORTS_CHANNEL_ID}`);
      }

      // Fetch the thread (report.discordMessageId contains the thread ID)
      const forumChannel = channel as ForumChannel;
      const thread = await forumChannel.threads.fetch(report.discordMessageId);
      if (!thread) {
        logger
          .withMetadata({
            reportId: event.data.id,
            threadId: report.discordMessageId,
          })
          .warn("Discord thread not found, skipping update");
        return;
      }

      // Get the starter message of the thread
      const starterMessage = await thread.fetchStarterMessage();
      if (!starterMessage) {
        logger
          .withMetadata({
            reportId: event.data.id,
            threadId: report.discordMessageId,
          })
          .warn("Thread starter message not found, skipping update");
        return;
      }

      // Fetch mod data to get the correct URL
      const mod = await this.modRepository.findById(event.data.modId);
      if (!mod) {
        throw new Error(`Mod with ID ${event.data.modId} not found`);
      }

      const { embed, components } = this.formatReportPost(
        event.data,
        mod.remoteUrl,
      );

      await starterMessage.edit({
        embeds: [embed],
        components,
      });

      // Update thread title to reflect status
      const newTitle = `${this.getReportTypeEmoji(event.data.type)} ${event.data.modName} - ${event.data.type} [${event.data.status.toUpperCase()}]`;
      await thread.setName(newTitle);

      // Update thread tags to reflect new status
      const updatedTags = this.getApplicableTags(forumChannel, event.data);
      await thread.setAppliedTags(updatedTags);

      logger
        .withMetadata({
          reportId: event.data.id,
          threadId: report.discordMessageId,
          newStatus: event.data.status,
          updatedTags: updatedTags.length,
        })
        .info("Successfully updated report status in Discord");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          reportId: event.data.id,
          newStatus: event.data.status,
        })
        .error("Failed to update report status in Discord");
      throw error;
    }
  }

  private getReportTypeEmoji(type: string): string {
    const reportTypeEmojis = {
      broken: "🔧",
      outdated: "📅",
      malicious: "⚠️",
      inappropriate: "🚫",
      other: "❓",
    };
    return reportTypeEmojis[type as keyof typeof reportTypeEmojis] || "❓";
  }

  private getApplicableTags(
    channel: ForumChannel,
    reportData: NewReportEvent["data"] | ReportStatusUpdatedEvent["data"],
  ): string[] {
    const tags: string[] = [];

    // Map report types to potential tag names
    const typeTagMap = {
      broken: ["broken", "bug", "issue"],
      outdated: ["outdated", "old", "update"],
      malicious: ["malicious", "virus", "dangerous"],
      inappropriate: ["inappropriate", "nsfw", "offensive"],
      other: ["other", "misc", "general"],
    };

    const statusTagMap = {
      unverified: ["unverified", "pending", "new"],
      verified: ["verified", "confirmed", "valid"],
      dismissed: ["dismissed", "invalid", "closed"],
    };

    // Find matching tags for report type
    const typeMatches =
      typeTagMap[reportData.type as keyof typeof typeTagMap] || [];
    for (const tagName of typeMatches) {
      const tag = channel.availableTags.find((t: GuildForumTag) =>
        t.name.toLowerCase().includes(tagName.toLowerCase()),
      );
      if (tag) {
        tags.push(tag.id);
        break; // Only add one type tag
      }
    }

    // Find matching tags for status
    const statusMatches =
      statusTagMap[reportData.status as keyof typeof statusTagMap] || [];
    for (const tagName of statusMatches) {
      const tag = channel.availableTags.find((t: GuildForumTag) =>
        t.name.toLowerCase().includes(tagName.toLowerCase()),
      );
      if (tag) {
        tags.push(tag.id);
        break; // Only add one status tag
      }
    }

    return tags;
  }

  private formatReportPost(
    reportData: NewReportEvent["data"] | ReportStatusUpdatedEvent["data"],
    modUrl: string,
  ): {
    embed: EmbedBuilder;
    components: ActionRowBuilder<ButtonBuilder>[];
  } {
    const reportTypeEmojis = {
      broken: "🔧",
      outdated: "📅",
      malicious: "⚠️",
      inappropriate: "🚫",
      other: "❓",
    };

    const statusColors = {
      unverified: 0xffa500, // Orange
      verified: 0xff0000, // Red
      dismissed: 0x808080, // Gray
    };

    const statusEmojis = {
      unverified: "⏳",
      verified: "✅",
      dismissed: "❌",
    };

    const embed = new EmbedBuilder()
      .setTitle(
        `${reportTypeEmojis[reportData.type]} Mod Report: ${reportData.modName}`,
      )
      .setDescription(reportData.reason)
      .setColor(statusColors[reportData.status])
      .addFields(
        {
          name: "Mod Details",
          value: `**Name:** ${reportData.modName}\n**Author:** ${reportData.modAuthor}\n**Mod ID:** \`${reportData.modId}\``,
          inline: true,
        },
        {
          name: "Report Details",
          value: `**Type:** ${reportData.type}\n**Status:** ${statusEmojis[reportData.status]} ${reportData.status}\n**Reported:** <t:${Math.floor(new Date(reportData.createdAt || new Date()).getTime() / 1000)}:R>`,
          inline: true,
        },
      )
      .setFooter({
        text: `Report ID: ${reportData.id}`,
      })
      .setTimestamp(new Date(reportData.createdAt || new Date()));

    if (reportData.description) {
      embed.addFields({
        name: "Additional Details",
        value:
          reportData.description.length > 1024
            ? `${reportData.description.substring(0, 1021)}...`
            : reportData.description,
        inline: false,
      });
    }

    if (reportData.verifiedBy) {
      embed.addFields({
        name: "Verified By",
        value: reportData.verifiedBy,
        inline: true,
      });
    }

    if (reportData.dismissedBy) {
      embed.addFields({
        name: "Dismissed By",
        value: reportData.dismissedBy,
        inline: true,
      });

      if (reportData.dismissalReason) {
        embed.addFields({
          name: "Dismissal Reason",
          value: reportData.dismissalReason,
          inline: false,
        });
      }
    }

    // Create action buttons for moderators
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    if (reportData.status === "unverified") {
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`verify_report:${reportData.id}`)
          .setLabel("Verify Report")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("✅"),
        new ButtonBuilder()
          .setCustomId(`dismiss_report:${reportData.id}`)
          .setLabel("Dismiss Report")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("❌"),
      );
      components.push(actionRow);
    }

    const utilityRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setURL(modUrl)
        .setLabel("View Mod")
        .setStyle(ButtonStyle.Link)
        .setEmoji("🔗"),
    );
    components.push(utilityRow);

    return { embed, components };
  }
}
