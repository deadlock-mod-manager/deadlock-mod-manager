import {
  db,
  ModDownloadRepository,
  ModRepository,
} from "@deadlock-mods/database";
import type { NewModEvent } from "@deadlock-mods/shared";
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
  service: "forum-poster",
});

export class ForumPosterService {
  private static instance: ForumPosterService | null = null;
  private readonly modRepository: ModRepository;
  private readonly modDownloadRepository: ModDownloadRepository;

  private constructor() {
    this.modRepository = new ModRepository(db);
    this.modDownloadRepository = new ModDownloadRepository(db);
  }

  static getInstance(): ForumPosterService {
    if (!ForumPosterService.instance) {
      ForumPosterService.instance = new ForumPosterService();
    }
    return ForumPosterService.instance;
  }

  async postNewMod(event: NewModEvent): Promise<void> {
    try {
      logger
        .withMetadata({
          modTitle: event.data.title,
          modLink: event.data.link,
          channelId: env.FORUM_CHANNEL_ID,
        })
        .info("Posting new mod to forum channel");

      const channel = await client.channels.fetch(env.FORUM_CHANNEL_ID);

      if (!channel) {
        throw new Error(`Channel with ID ${env.FORUM_CHANNEL_ID} not found`);
      }

      if (channel.type !== ChannelType.GuildForum) {
        throw new Error(
          `Channel ${env.FORUM_CHANNEL_ID} is not a forum channel (type: ${channel.type})`,
        );
      }

      const modTitle = event.data.title;
      const enrichedData = await this.enrichModData(event.data);
      const { content, embeds, components } =
        this.formatForumPost(enrichedData);
      const availableTags = this.getApplicableTags(channel, event.data);
      const thread = await channel.threads.create({
        name: modTitle,
        appliedTags: availableTags,
        message: {
          content,
          embeds,
          components,
        },
      });

      logger
        .withMetadata({
          threadId: thread.id,
          threadName: thread.name,
          modTitle: event.data.title,
        })
        .info("Successfully created forum post for new mod");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          modTitle: event.data.title,
          modLink: event.data.link,
        })
        .error("Failed to post new mod to forum channel");
      throw error;
    }
  }

  private parseRemoteId(url: string): string | null {
    try {
      const urlParts = url.split("/");
      const lastPart = urlParts[urlParts.length - 1];
      const remoteId = lastPart?.split("?")[0];
      return remoteId && /^\d+$/.test(remoteId) ? remoteId : null;
    } catch (error) {
      logger.withError(error).warn("Failed to parse remote ID from URL");
      return null;
    }
  }

  private async enrichModData(eventData: NewModEvent["data"]): Promise<
    NewModEvent["data"] & {
      description?: string;
      downloads?: number;
      likes?: number;
      author?: string;
      category?: string;
      downloadUrl?: string;
      isAudio?: boolean;
    }
  > {
    try {
      const remoteId = this.parseRemoteId(eventData.link);

      if (!remoteId) {
        logger
          .withMetadata({ url: eventData.link })
          .warn("Could not parse remote ID from URL");
        return eventData;
      }

      logger
        .withMetadata({ remoteId, url: eventData.link })
        .debug("Parsed remote ID from URL");

      const mod = await this.modRepository.findByRemoteId(remoteId);

      if (!mod) {
        logger
          .withMetadata({ remoteId })
          .info("Mod not found in database, using RSS data only");
        return eventData;
      }

      // Fetch download URL
      const downloads = await this.modDownloadRepository.findByModId(mod.id);
      const downloadUrl = downloads.length > 0 ? downloads[0].url : undefined;

      logger
        .withMetadata({
          remoteId,
          modId: mod.id,
          hasDescription: !!mod.description,
          downloads: mod.downloadCount,
          likes: mod.likes,
          hasDownloadUrl: !!downloadUrl,
        })
        .info("Enriched mod data from database");

      return {
        ...eventData,
        description: mod.description || undefined,
        downloads: mod.downloadCount || undefined,
        likes: mod.likes || undefined,
        author: mod.author || undefined,
        category: mod.category || undefined,
        downloadUrl: downloadUrl,
        isAudio: mod.isAudio,
      };
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ url: eventData.link })
        .warn("Failed to enrich mod data, using RSS data only");
      return eventData;
    }
  }

  private getApplicableTags(
    channel: ForumChannel,
    mod: NewModEvent["data"],
  ): string[] {
    try {
      const availableTags = channel.availableTags;

      if (!availableTags || availableTags.length === 0) {
        logger.warn("No tags available in forum channel");
        return [];
      }

      const tagsArray = Array.from(availableTags.values());

      let targetTagName: string;
      if (mod.link.includes("/mods/")) {
        targetTagName = "Addon";
      } else if (mod.link.includes("/sounds/")) {
        targetTagName = "Sound";
      } else {
        targetTagName = "Addon";
      }

      const matchingTag = tagsArray.find((tag) => tag.name === targetTagName);

      if (matchingTag) {
        logger
          .withMetadata({
            tagId: matchingTag.id,
            tagName: matchingTag.name,
            linkType: mod.link.includes("/mods/")
              ? "mods"
              : mod.link.includes("/sounds/")
                ? "sounds"
                : "unknown",
          })
          .info("Found matching forum tag based on URL");
        return [matchingTag.id];
      }

      const fallbackTag =
        tagsArray.find((tag) => tag.name === "Addon" || tag.name === "Sound") ||
        tagsArray[0];

      if (fallbackTag) {
        logger
          .withMetadata({
            tagId: fallbackTag.id,
            tagName: fallbackTag.name,
            requestedTag: targetTagName,
            fallback: true,
          })
          .warn("Using fallback forum tag - requested tag not found");
        return [fallbackTag.id];
      }

      logger.error("No suitable tags found in forum channel");
      return [];
    } catch (error) {
      logger
        .withError(error)
        .error("Error getting forum tags, will attempt without tags");
      return [];
    }
  }

  private formatForumPost(
    mod: NewModEvent["data"] & {
      description?: string;
      downloads?: number;
      likes?: number;
      author?: string;
      category?: string;
      downloadUrl?: string;
      isAudio?: boolean;
    },
  ): {
    content: string;
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
  } {
    const publishDate = new Date(mod.pubDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let content = `**New Deadlock Mod Available!**\n\n`;
    content += `Published: ${publishDate}\n`;

    if (mod.author) {
      content += `Author: ${mod.author}\n`;
    }

    if (mod.category) {
      content += `Category: ${mod.category}\n`;
    }

    content += `Source: ${mod.source}\n`;
    content += `[Download from GameBanana](${mod.link})\n\n`;

    if (mod.description) {
      const truncatedDescription =
        mod.description.length > 200
          ? `${mod.description.substring(0, 200)}...`
          : mod.description;
      content += `${truncatedDescription}\n\n`;
    }

    content += `*This mod was automatically detected from GameBanana. Please check the mod page for installation instructions and compatibility information.*`;

    const embed = new EmbedBuilder()
      .setTitle(mod.title)
      .setURL(mod.link)
      .setTimestamp(new Date(mod.pubDate))
      .setFooter({
        text: "GameBanana • Deadlock Mod Manager",
        iconURL: "https://gamebanana.com/favicon.ico",
      });

    if (mod.downloads !== undefined) {
      embed.addFields({
        name: "📥 Downloads",
        value: mod.downloads.toLocaleString(),
        inline: true,
      });
    }

    if (mod.likes !== undefined) {
      embed.addFields({
        name: "❤️ Likes",
        value: mod.likes.toLocaleString(),
        inline: true,
      });
    }

    if (mod.image) {
      embed.setImage(mod.image);
    }

    // Create download button if we have download URL
    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (mod.downloadUrl) {
      const remoteId = this.parseRemoteId(mod.link);
      if (remoteId) {
        // Use V2 API redirect endpoint
        const redirectUrl = `${env.API_URL}/redirect/mod/${remoteId}`;

        const downloadButton = new ButtonBuilder()
          .setLabel("Download using Mod Manager")
          .setStyle(ButtonStyle.Link)
          .setURL(redirectUrl)
          .setEmoji("📥");

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          downloadButton,
        );

        components.push(actionRow);
      }
    }

    return {
      content,
      embeds: [embed],
      components,
    };
  }
}
