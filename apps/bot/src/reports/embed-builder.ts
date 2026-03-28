import type { Mod } from "@deadlock-mods/database";
import type {
  NewReportEvent,
  ReportStatusUpdatedEvent,
} from "@deadlock-mods/shared";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ForumChannel,
  type GuildForumTag,
  EmbedBuilder,
} from "discord.js";

const reportTypeEmojis: Record<string, string> = {
  broken: "🔧",
  outdated: "📅",
  malicious: "⚠️",
  inappropriate: "🚫",
  other: "❓",
};

const statusColors: Record<string, number> = {
  unverified: 0xffa500,
  verified: 0xff0000,
  dismissed: 0x808080,
};

const statusEmojis: Record<string, string> = {
  unverified: "⏳",
  verified: "✅",
  dismissed: "❌",
};

const typeTagMap: Record<string, string[]> = {
  broken: ["broken", "bug", "issue"],
  outdated: ["outdated", "old", "update"],
  malicious: ["malicious", "virus", "dangerous"],
  inappropriate: ["inappropriate", "nsfw", "offensive"],
  other: ["other", "misc", "general"],
};

const statusTagMap: Record<string, string[]> = {
  unverified: ["unverified", "pending", "new"],
  verified: ["verified", "confirmed", "valid"],
  dismissed: ["dismissed", "invalid", "closed"],
};

export function getReportTypeEmoji(type: string): string {
  return reportTypeEmojis[type] ?? "❓";
}

export function getApplicableReportTags(
  channel: ForumChannel,
  reportData: NewReportEvent["data"] | ReportStatusUpdatedEvent["data"],
): string[] {
  const tags: string[] = [];

  const typeMatches = typeTagMap[reportData.type] ?? [];
  for (const tagName of typeMatches) {
    const tag = channel.availableTags.find((t: GuildForumTag) =>
      t.name.toLowerCase().includes(tagName.toLowerCase()),
    );
    if (tag) {
      tags.push(tag.id);
      break;
    }
  }

  const statusMatches = statusTagMap[reportData.status] ?? [];
  for (const tagName of statusMatches) {
    const tag = channel.availableTags.find((t: GuildForumTag) =>
      t.name.toLowerCase().includes(tagName.toLowerCase()),
    );
    if (tag) {
      tags.push(tag.id);
      break;
    }
  }

  return tags;
}

export function formatReportPost(
  reportData: NewReportEvent["data"] | ReportStatusUpdatedEvent["data"],
  mod: Mod,
): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const typeEmoji = getReportTypeEmoji(reportData.type);
  const statusColor = statusColors[reportData.status] ?? 0x808080;
  const statusEmoji = statusEmojis[reportData.status] ?? "";

  const embed = new EmbedBuilder()
    .setTitle(`${typeEmoji} Mod Report: ${reportData.modName}`)
    .setDescription(reportData.reason)
    .setColor(statusColor)
    .addFields(
      {
        name: "Mod Details",
        value: `**Name:** ${reportData.modName}\n**Author:** ${reportData.modAuthor}\n**Mod ID:** \`${reportData.modId}\``,
        inline: true,
      },
      {
        name: "Report Details",
        value: `**Type:** ${reportData.type}\n**Status:** ${statusEmoji} ${reportData.status}\n**Reported:** <t:${Math.floor(new Date(reportData.createdAt || new Date()).getTime() / 1000)}:R>`,
        inline: true,
      },
    )
    .setFooter({
      text: `Report ID: ${reportData.id}`,
    })
    .setTimestamp(new Date(reportData.createdAt || new Date()));

  const modImage = mod.hero || (mod.images.length > 0 ? mod.images[0] : null);
  if (modImage) {
    embed.setImage(modImage);
  }

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
      .setURL(mod.remoteUrl)
      .setLabel("View Mod")
      .setStyle(ButtonStyle.Link)
      .setEmoji("🔗"),
  );
  components.push(utilityRow);

  return { embed, components };
}
