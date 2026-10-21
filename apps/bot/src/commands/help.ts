import { Command } from "@sapphire/framework";
import { GuildMember, MessageFlags } from "discord.js";
import {
  hasBlacklistPermission,
  hasForumModerationPermission,
  hasPerfConfigModerationPermission,
  hasQuickAnswerEditorPermission,
  hasQuickAnswerUsePermission,
  hasReportModerationPermission,
} from "@/lib/permissions";

interface HelpEntry {
  usage: string;
  description: string;
  allowed: (member: GuildMember) => boolean;
}

const everyone = () => true;

// Keep in sync with the commands and buttons the bot registers
const helpEntries: HelpEntry[] = [
  {
    usage: "/ping",
    description: "Check that the bot is online.",
    allowed: everyone,
  },
  {
    usage: "Mark as solved",
    description:
      "Button on new bug reports. The post's author or a forum moderator can press it to close the post.",
    allowed: everyone,
  },
  {
    usage: "/forum close",
    description:
      "Close a bug report or suggestion as resolved, duplicate, won't fix, planned or declined. Link the original with `duplicate_of`.",
    allowed: hasForumModerationPermission,
  },
  {
    usage: "/forum cleanup",
    description:
      "Queue an immediate cleanup of bug reports and suggestions using the usual rules.",
    allowed: hasForumModerationPermission,
  },
  {
    usage: "/quickanswer answer, /quickanswer preview",
    description:
      "Send a saved answer in this channel, or preview it privately.",
    allowed: hasQuickAnswerUsePermission,
  },
  {
    usage: "/quickanswer setup, edit, delete, media-add, media-remove",
    description: "Create and maintain quick answer templates.",
    allowed: hasQuickAnswerEditorPermission,
  },
  {
    usage: "/reports clear target:<mod URL, member URL, or exact author name>",
    description: "Clear all reports for a mod or author.",
    allowed: (member) => hasReportModerationPermission(member.user, member),
  },
  {
    usage: "/blacklist add, /blacklist remove",
    description: "Block or unblock a GameBanana mod by ID or URL.",
    allowed: (member) => hasBlacklistPermission(member.user, member),
  },
  {
    usage: "/perfconfig add, /perfconfig remove",
    description:
      "Mark a GameBanana upload that is only a performance config (gameinfo.gi, no VPKs) so the app opens it in Performance instead of installing it as a mod, or undo that. Leave uploads that also ship VPKs alone: installing them already offers to import the config.",
    allowed: hasPerfConfigModerationPermission,
  },
  {
    usage: "/pattern add",
    description:
      "Teach the bot an example message to redirect to bug reports or help.",
    allowed: (member) => hasBlacklistPermission(member.user, member),
  },
  {
    usage: "/ai enable, /ai disable",
    description: "Turn AI replies on or off.",
    allowed: (member) => member.permissions.has("Administrator"),
  },
];

export class HelpCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("help")
        .setDescription("List the bot commands you can use"),
    );
  }

  override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const member = interaction.member;
    if (!(member instanceof GuildMember)) {
      return interaction.reply({
        content: "Use this command inside the server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const lines = helpEntries
      .filter((entry) => entry.allowed(member))
      .map((entry) => `**${entry.usage}**\n${entry.description}`);

    return interaction.reply({
      content: `Here's what you can do with the bot:\n\n${lines.join("\n\n")}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
