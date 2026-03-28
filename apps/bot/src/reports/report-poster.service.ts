import { db, ModRepository, ReportRepository } from "@deadlock-mods/database";
import type {
  NewReportEvent,
  ReportStatusUpdatedEvent,
} from "@deadlock-mods/shared";
import { ChannelType, type ForumChannel } from "discord.js";
import { inject, singleton } from "tsyringe";
import { SapphireClient } from "@sapphire/framework";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";
import { TOKENS } from "@/lib/tokens";
import {
  formatReportPost,
  getApplicableReportTags,
  getReportTypeEmoji,
} from "@/reports/embed-builder";

const logger = mainLogger.child().withContext({
  service: "report-poster",
});

@singleton()
export class ReportPosterService {
  private readonly reportRepository: ReportRepository;
  private readonly modRepository: ModRepository;

  constructor(
    @inject(TOKENS.DiscordClient) private readonly client: SapphireClient,
  ) {
    this.reportRepository = new ReportRepository(db);
    this.modRepository = new ModRepository(db);
  }

  async postNewReport(event: NewReportEvent): Promise<void> {
    try {
      if (env.NODE_ENV === "development") {
        logger.warn("Skipping Discord post in development environment");
        return;
      }
      if (!env.REPORTS_CHANNEL_ID) {
        logger.warn("REPORTS_CHANNEL_ID not configured, skipping Discord post");
        return;
      }

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

      const channel = await this.client.channels.fetch(env.REPORTS_CHANNEL_ID);

      if (!channel) {
        throw new Error(`Channel with ID ${env.REPORTS_CHANNEL_ID} not found`);
      }

      if (channel.type !== ChannelType.GuildForum) {
        throw new Error(
          `Channel ${env.REPORTS_CHANNEL_ID} is not a forum channel (type: ${channel.type})`,
        );
      }

      const mod = await this.modRepository.findById(event.data.modId);
      if (!mod) {
        throw new Error(`Mod with ID ${event.data.modId} not found`);
      }

      const { embed, components } = formatReportPost(event.data, mod);
      const forumChannel = channel as ForumChannel;
      const threadTitle = `${getReportTypeEmoji(event.data.type)} ${event.data.modName} - ${event.data.type}`;
      const availableTags = getApplicableReportTags(forumChannel, event.data);

      const thread = await forumChannel.threads.create({
        name: threadTitle,
        appliedTags: availableTags,
        message: {
          embeds: [embed],
          components,
        },
      });

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

      const channel = await this.client.channels.fetch(env.REPORTS_CHANNEL_ID);
      if (!channel || channel.type !== ChannelType.GuildForum) {
        throw new Error(`Invalid channel: ${env.REPORTS_CHANNEL_ID}`);
      }

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

      const mod = await this.modRepository.findById(event.data.modId);
      if (!mod) {
        throw new Error(`Mod with ID ${event.data.modId} not found`);
      }

      const { embed, components } = formatReportPost(event.data, mod);

      await starterMessage.edit({
        embeds: [embed],
        components,
      });

      const newTitle = `${getReportTypeEmoji(event.data.type)} ${event.data.modName} - ${event.data.type} [${event.data.status.toUpperCase()}]`;
      await thread.setName(newTitle);

      const updatedTags = getApplicableReportTags(forumChannel, event.data);
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
}
