import { db, ModRepository } from "@deadlock-mods/database";
import { Command } from "@sapphire/framework";
import { type GuildMember, PermissionFlagsBits } from "discord.js";
import { logger as mainLogger } from "../lib/logger";
import {
  getBlacklistRequiredPermissionsDisplay,
  hasBlacklistPermission,
} from "../lib/permissions";

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
        .setDescription("Manage mod blacklist (Administrator only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    const { user, member } = interaction;

    // Check permissions
    if (!hasBlacklistPermission(user, member as GuildMember)) {
      return interaction.reply({
        content: `You don't have permission to use this command. Required: ${getBlacklistRequiredPermissionsDisplay()}`,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const modIdOrUrl = interaction.options.getString("mod_id_or_url", true);

    try {
      // Extract mod ID from URL if needed
      const modId = this.extractModId(modIdOrUrl);

      if (subcommand === "add") {
        const reason = interaction.options.getString("reason", true);
        return await this.handleAdd(interaction, modId, reason);
      } else if (subcommand === "remove") {
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
    // If it's already just a number, return it
    if (/^\d+$/.test(input)) {
      return input;
    }

    // Extract from GameBanana URL
    const gamebananaMatch = input.match(/gamebanana\.com\/mods\/(\d+)/i);
    if (gamebananaMatch) {
      return gamebananaMatch[1];
    }

    // If we can't extract a valid ID, throw an error
    throw new Error("Invalid mod ID or URL format");
  }

  private async handleAdd(
    interaction: Command.ChatInputCommandInteraction,
    modId: string,
    reason: string,
  ) {
    const { user } = interaction;

    // Check if mod exists
    const mod = await modRepository.findByRemoteIdIncludingBlacklisted(modId);
    if (!mod) {
      return interaction.reply({
        content: `Mod with ID \`${modId}\` not found.`,
      });
    }

    // Check if already blacklisted
    if (mod.isBlacklisted) {
      return interaction.reply({
        content: `Mod \`${mod.name}\` is already blacklisted.`,
      });
    }

    // Blacklist the mod
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

    // Check if mod exists
    const mod = await modRepository.findByRemoteIdIncludingBlacklisted(modId);
    if (!mod) {
      return interaction.reply({
        content: `Mod with ID \`${modId}\` not found.`,
      });
    }

    // Check if not blacklisted
    if (!mod.isBlacklisted) {
      return interaction.reply({
        content: `Mod \`${mod.name}\` is not blacklisted.`,
      });
    }

    // Unblacklist the mod
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
