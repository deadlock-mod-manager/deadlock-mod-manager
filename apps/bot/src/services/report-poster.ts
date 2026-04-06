import { NotFoundError, ValidationError } from "@deadlock-mods/common";
import {
  db,
  type Mod,
  ModRepository,
  ReportRepository,
} from "@deadlock-mods/database";
import type { NewReportEvent } from "@deadlock-mods/shared";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type ForumChannel,
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
          channelId: env.REPORTS_CHANNEL_ID,
        })
        .info("Posting new report to Discord channel");

      const channel = await client.channels.fetch(env.REPORTS_CHANNEL_ID);

      if (!channel) {
        throw new NotFoundError(
          `Channel with ID ${env.REPORTS_CHANNEL_ID} not found`,
        );
      }

      if (channel.type !== ChannelType.GuildForum) {
        throw new ValidationError(
          `Channel ${env.REPORTS_CHANNEL_ID} is not a forum channel (type: ${channel.type})`,
        );
      }

      const mod = await this.modRepository.findById(event.data.modId);
      if (!mod) {
        throw new NotFoundError(`Mod with ID ${event.data.modId} not found`);
      }

      const { embed, components } = this.formatReportPost(event.data, mod);
      const forumChannel = channel as ForumChannel;
      const threadTitle = `🔧 ${event.data.modName} - Broken Report`;

      const thread = await forumChannel.threads.create({
        name: threadTitle,
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

  private formatReportPost(
    reportData: NewReportEvent["data"],
    mod: Mod,
  ): {
    embed: EmbedBuilder;
    components: ActionRowBuilder<ButtonBuilder>[];
  } {
    const embed = new EmbedBuilder()
      .setTitle(`🔧 Broken Mod Report: ${reportData.modName}`)
      .setColor(0xffa500)
      .addFields({
        name: "Mod Details",
        value: `**Name:** ${reportData.modName}\n**Author:** ${reportData.modAuthor}\n**Mod ID:** \`${reportData.modId}\``,
        inline: true,
      })
      .setFooter({
        text: `Report ID: ${reportData.id}`,
      })
      .setTimestamp(new Date(reportData.createdAt || new Date()));

    const modImage = mod.hero || (mod.images.length > 0 ? mod.images[0] : null);
    if (modImage) {
      embed.setImage(modImage);
    }

    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    const utilityRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setURL(mod.remoteUrl)
        .setLabel("View Mod")
        .setStyle(ButtonStyle.Link)
        .setEmoji("🔗"),
    );
    components.push(utilityRow);

    return { embed, components };
  }
}
