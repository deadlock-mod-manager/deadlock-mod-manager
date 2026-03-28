import { db, ModRepository, ReportRepository } from "@deadlock-mods/database";
import type {
  NewReportEvent,
  ReportStatusUpdatedEvent,
} from "@deadlock-mods/shared";
import { ChannelType, type ForumChannel } from "discord.js";
import { inject, singleton } from "tsyringe";
import { SapphireClient } from "@sapphire/framework";
import { env } from "@/lib/env";
import { wideEventContext } from "@/lib/logger";
import { TOKENS } from "@/lib/tokens";
import {
  formatReportPost,
  getApplicableReportTags,
  getReportTypeEmoji,
} from "@/reports/embed-builder";

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
    const wide = wideEventContext.get();
    wide?.merge({
      service: "report-poster",
      reportId: event.data.id,
      modName: event.data.modName,
      reportType: event.data.type,
    });

    try {
      if (env.NODE_ENV === "development") {
        wide?.merge({ reportPostOutcome: "skipped_dev" });
        return;
      }
      if (!env.REPORTS_CHANNEL_ID) {
        wide?.merge({ reportPostOutcome: "skipped_no_channel" });
        return;
      }

      const existingReport = await this.reportRepository.findById(
        event.data.id,
      );
      if (existingReport?.discordMessageId) {
        wide?.merge({
          reportPostOutcome: "skipped_duplicate_thread",
          existingThreadId: existingReport.discordMessageId,
        });
        return;
      }

      wide?.merge({ channelId: env.REPORTS_CHANNEL_ID });

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

      wide?.merge({
        reportPostOutcome: "posted",
        threadId: thread.id,
      });
    } catch (error) {
      wide?.merge({ reportPostOutcome: "failed" });
      throw error;
    }
  }

  async updateReportStatus(event: ReportStatusUpdatedEvent): Promise<void> {
    const wide = wideEventContext.get();
    wide?.merge({
      service: "report-poster",
      reportId: event.data.id,
      newStatus: event.data.status,
      modName: event.data.modName,
    });

    try {
      if (!env.REPORTS_CHANNEL_ID) {
        wide?.merge({ reportUpdateOutcome: "skipped_no_channel" });
        return;
      }

      const report = await this.reportRepository.findById(event.data.id);
      if (!report || !report.discordMessageId) {
        wide?.merge({ reportUpdateOutcome: "skipped_no_thread" });
        return;
      }

      const channel = await this.client.channels.fetch(env.REPORTS_CHANNEL_ID);
      if (!channel || channel.type !== ChannelType.GuildForum) {
        throw new Error(`Invalid channel: ${env.REPORTS_CHANNEL_ID}`);
      }

      const forumChannel = channel as ForumChannel;
      const thread = await forumChannel.threads.fetch(report.discordMessageId);
      if (!thread) {
        wide?.merge({
          reportUpdateOutcome: "skipped_thread_missing",
          threadId: report.discordMessageId,
        });
        return;
      }

      const starterMessage = await thread.fetchStarterMessage();
      if (!starterMessage) {
        wide?.merge({
          reportUpdateOutcome: "skipped_no_starter_message",
          threadId: report.discordMessageId,
        });
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

      wide?.merge({
        reportUpdateOutcome: "updated",
        threadId: report.discordMessageId,
        updatedTags: updatedTags.length,
      });
    } catch (error) {
      wide?.merge({ reportUpdateOutcome: "failed" });
      throw error;
    }
  }
}
