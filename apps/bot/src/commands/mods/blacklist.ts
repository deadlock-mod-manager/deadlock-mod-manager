import { db, ModRepository } from "@deadlock-mods/database";
import { Command } from "@sapphire/framework";
import { GuildMember } from "discord.js";
import {
  getBlacklistRequiredPermissionsDisplay,
  hasBlacklistPermission,
} from "@/discord/permissions";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "blacklist-command",
});

const modRepository = new ModRepository(db);

export class BlacklistCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("blacklist")
        .setDescription(
          "Manage mod blacklist (bot owner, Server Administrator, or moderator roles)",
        )
        .setDefaultMemberPermissions(null)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Blacklist a mod")
            .addStringOption((option) =>
              option
                .setName("mod_id_or_url")
                .setDescription("GameBanana mod ID or URL")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("reason")
                .setDescription("Reason for blacklisting")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Remove a mod from blacklist")
            .addStringOption((option) =>
              option
                .setName("mod_id_or_url")
                .setDescription("GameBanana mod ID or URL")
                .setRequired(true),
            ),
        ),
    );
  }

  override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const { user } = interaction;
    const member =
      interaction.member instanceof GuildMember ? interaction.member : null;

    if (!hasBlacklistPermission(user, member)) {
      return interaction.reply({
        content: `You don't have permission to use this command. Required: ${getBlacklistRequiredPermissionsDisplay()}`,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const modIdOrUrl = interaction.options.getString("mod_id_or_url", true);

    try {
      const modId = this.extractModId(modIdOrUrl);

      if (subcommand === "add") {
        const reason = interaction.options.getString("reason", true);
        return await this.handleAdd(interaction, modId, reason);
      }
      if (subcommand === "remove") {
        return await this.handleRemove(interaction, modId);
      }
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          userId: user.id,
          username: user.username,
          subcommand,
          modIdOrUrl,
        })
        .error("Error in blacklist command");

      return interaction.reply({
        content: "An error occurred while processing the request.",
      });
    }
  }

  private extractModId(input: string): string {
    if (/^\d+$/.test(input)) {
      return input;
    }

    const gamebananaMatch = input.match(/gamebanana\.com\/mods\/(\d+)/i);
    if (gamebananaMatch) {
      return gamebananaMatch[1];
    }

    throw new Error("Invalid mod ID or URL format");
  }

  private async handleAdd(
    interaction: Command.ChatInputCommandInteraction,
    modId: string,
    reason: string,
  ) {
    const { user } = interaction;

    const mod = await modRepository.findByRemoteIdIncludingBlacklisted(modId);
    if (!mod) {
      return interaction.reply({
        content: `Mod with ID \`${modId}\` not found.`,
      });
    }

    if (mod.isBlacklisted) {
      return interaction.reply({
        content: `Mod \`${mod.name}\` is already blacklisted.`,
      });
    }

    await modRepository.blacklistMod(modId, reason, user.id);

    logger
      .withMetadata({
        userId: user.id,
        username: user.username,
        modId,
        modName: mod.name,
        reason,
      })
      .info("Mod blacklisted");

    return interaction.reply({
      content: `Successfully blacklisted mod \`${mod.name}\` (ID: \`${modId}\`)\n**Reason:** ${reason}`,
    });
  }

  private async handleRemove(
    interaction: Command.ChatInputCommandInteraction,
    modId: string,
  ) {
    const { user } = interaction;

    const mod = await modRepository.findByRemoteIdIncludingBlacklisted(modId);
    if (!mod) {
      return interaction.reply({
        content: `Mod with ID \`${modId}\` not found.`,
      });
    }

    if (!mod.isBlacklisted) {
      return interaction.reply({
        content: `Mod \`${mod.name}\` is not blacklisted.`,
      });
    }

    await modRepository.unblacklistMod(modId);

    logger
      .withMetadata({
        userId: user.id,
        username: user.username,
        modId,
        modName: mod.name,
      })
      .info("Mod unblacklisted");

    return interaction.reply({
      content: `Successfully removed mod \`${mod.name}\` (ID: \`${modId}\`) from blacklist.`,
    });
  }
}
