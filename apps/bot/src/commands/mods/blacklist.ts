import { db, ModRepository } from "@deadlock-mods/database";
import { Command } from "@sapphire/framework";
import { GuildMember } from "discord.js";
import type { WideEvent } from "@deadlock-mods/logging";
import {
  getBlacklistRequiredPermissionsDisplay,
  hasBlacklistPermission,
} from "@/discord/permissions";
import { logger, runWithWideEvent, wideEventContext } from "@/lib/logger";

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
    return runWithWideEvent(
      wideEventContext,
      logger,
      "blacklist_command",
      {
        service: "blacklist-command",
        userId: interaction.user.id,
        username: interaction.user.username,
      },
      async (wide) => {
        const { user } = interaction;
        const member =
          interaction.member instanceof GuildMember ? interaction.member : null;

        if (!hasBlacklistPermission(user, member)) {
          wide.merge({ outcome: "denied_permission" });
          return interaction.reply({
            content: `You don't have permission to use this command. Required: ${getBlacklistRequiredPermissionsDisplay()}`,
          });
        }

        const subcommand = interaction.options.getSubcommand();
        const modIdOrUrl = interaction.options.getString("mod_id_or_url", true);

        wide.merge({ subcommand });

        try {
          const modId = this.extractModId(modIdOrUrl);

          if (subcommand === "add") {
            const reason = interaction.options.getString("reason", true);
            return await this.handleAdd(interaction, modId, reason, wide);
          }
          if (subcommand === "remove") {
            return await this.handleRemove(interaction, modId, wide);
          }
        } catch {
          wide.merge({ outcome: "command_error", modIdOrUrl });
          return interaction.reply({
            content: "An error occurred while processing the request.",
          });
        }

        return undefined;
      },
    );
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
    wide: WideEvent,
  ) {
    const { user } = interaction;

    const mod = await modRepository.findByRemoteIdIncludingBlacklisted(modId);
    if (!mod) {
      wide.merge({ outcome: "mod_not_found", modId });
      return interaction.reply({
        content: `Mod with ID \`${modId}\` not found.`,
      });
    }

    if (mod.isBlacklisted) {
      wide.merge({ outcome: "already_blacklisted", modId, modName: mod.name });
      return interaction.reply({
        content: `Mod \`${mod.name}\` is already blacklisted.`,
      });
    }

    await modRepository.blacklistMod(modId, reason, user.id);

    wide.merge({
      outcome: "blacklisted",
      modId,
      modName: mod.name,
      reason,
    });

    return interaction.reply({
      content: `Successfully blacklisted mod \`${mod.name}\` (ID: \`${modId}\`)\n**Reason:** ${reason}`,
    });
  }

  private async handleRemove(
    interaction: Command.ChatInputCommandInteraction,
    modId: string,
    wide: WideEvent,
  ) {
    const mod = await modRepository.findByRemoteIdIncludingBlacklisted(modId);
    if (!mod) {
      wide.merge({ outcome: "mod_not_found", modId });
      return interaction.reply({
        content: `Mod with ID \`${modId}\` not found.`,
      });
    }

    if (!mod.isBlacklisted) {
      wide.merge({ outcome: "not_blacklisted", modId, modName: mod.name });
      return interaction.reply({
        content: `Mod \`${mod.name}\` is not blacklisted.`,
      });
    }

    await modRepository.unblacklistMod(modId);

    wide.merge({
      outcome: "unblacklisted",
      modId,
      modName: mod.name,
    });

    return interaction.reply({
      content: `Successfully removed mod \`${mod.name}\` (ID: \`${modId}\`) from blacklist.`,
    });
  }
}
