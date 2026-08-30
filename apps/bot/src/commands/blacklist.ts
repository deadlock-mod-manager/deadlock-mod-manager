import {
  db,
  type PolicyIdentity,
  PolicyRuleRepository,
} from "@deadlock-mods/database";
import { Command } from "@sapphire/framework";
import { type GuildMember } from "discord.js";
import { logger as mainLogger } from "../lib/logger";
import {
  getBlacklistRequiredPermissionsDisplay,
  hasBlacklistPermission,
} from "../lib/permissions";
import { parsePolicyIdentity } from "../lib/policy-identity";

const logger = mainLogger.child().withContext({
  service: "blacklist-command",
});

const policyRepository = new PolicyRuleRepository(db);

export class BlacklistCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("blacklist")
        .setDescription("Manage mod blacklist")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Blacklist a mod")
            .addStringOption((option) =>
              option
                .setName("mod_id_or_url")
                .setDescription("GameBanana mod/sound ID or URL")
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
                .setDescription("GameBanana mod/sound ID or URL")
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
      const identity = parsePolicyIdentity(modIdOrUrl);

      if (subcommand === "add") {
        const reason = interaction.options.getString("reason", true);
        return await this.handleAdd(interaction, identity, reason);
      } else if (subcommand === "remove") {
        return await this.handleRemove(interaction, identity);
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

  private async handleAdd(
    interaction: Command.ChatInputCommandInteraction,
    identity: PolicyIdentity,
    reason: string,
  ) {
    const { user } = interaction;

    const existing = await policyRepository.find(identity, "blacklisted");
    if (existing) {
      return interaction.reply({
        content: `${this.displayIdentity(identity)} is already blacklisted.`,
      });
    }

    await policyRepository.upsert({
      ...identity,
      kind: "blacklisted",
      reason,
      createdBy: user.id,
    });

    logger
      .withMetadata({
        userId: user.id,
        username: user.username,
        submissionType: identity.submissionType,
        submissionId: identity.submissionId,
      })
      .info("Mod blacklisted");

    return interaction.reply({
      content: `Successfully blacklisted ${this.displayIdentity(identity)}.\n**Reason:** ${reason}`,
    });
  }

  private async handleRemove(
    interaction: Command.ChatInputCommandInteraction,
    identity: PolicyIdentity,
  ) {
    const { user } = interaction;

    const removed = await policyRepository.delete(identity, "blacklisted");
    if (!removed) {
      return interaction.reply({
        content: `${this.displayIdentity(identity)} is not blacklisted.`,
      });
    }

    logger
      .withMetadata({
        userId: user.id,
        username: user.username,
        submissionType: identity.submissionType,
        submissionId: identity.submissionId,
      })
      .info("Mod unblacklisted");

    return interaction.reply({
      content: `Successfully removed ${this.displayIdentity(identity)} from the blacklist.`,
    });
  }

  private displayIdentity(identity: PolicyIdentity): string {
    const type = identity.submissionType === "sound" ? "sound" : "mod";
    return `${type} ID \`${identity.submissionId}\``;
  }
}
