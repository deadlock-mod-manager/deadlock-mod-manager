import type { NewModEvent } from "@deadlock-mods/shared";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ForumChannel,
} from "discord.js";
import { env } from "@/lib/env";

export function getModForumTags(
  channel: ForumChannel,
  mod: NewModEvent["data"],
): string[] {
  const availableTags = channel.availableTags;

  if (!availableTags || availableTags.length === 0) {
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
    return [matchingTag.id];
  }

  const fallbackTag =
    tagsArray.find((tag) => tag.name === "Addon" || tag.name === "Sound") ||
    tagsArray[0];

  if (fallbackTag) {
    return [fallbackTag.id];
  }

  return [];
}

export function parseRemoteIdFromUrl(url: string): string | null {
  try {
    const urlParts = url.split("/");
    const lastPart = urlParts[urlParts.length - 1];
    const remoteId = lastPart?.split("?")[0];
    return remoteId && /^\d+$/.test(remoteId) ? remoteId : null;
  } catch {
    return null;
  }
}

export function buildModForumPost(
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

  content +=
    "*This mod was automatically detected from GameBanana. Please check the mod page for installation instructions and compatibility information.*";

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

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (mod.downloadUrl) {
    const remoteId = parseRemoteIdFromUrl(mod.link);
    if (remoteId) {
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
