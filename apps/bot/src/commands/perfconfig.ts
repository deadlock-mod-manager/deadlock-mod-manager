import {
  db,
  type PolicyIdentity,
  PolicyRuleRepository,
} from "@deadlock-mods/database";
import { Command } from "@sapphire/framework";
import { GuildMember, MessageFlags } from "discord.js";
import { logger as mainLogger } from "../lib/logger";
import {
  isPerformanceConfigCorrection,
  withoutPerformanceConfigCategory,
  withPerformanceConfigCategory,
} from "../lib/perf-config-correction";
import { hasPerfConfigModerationPermission } from "../lib/permissions";
import { parsePolicyIdentity } from "../lib/policy-identity";

const logger = mainLogger.child().withContext({
  service: "perfconfig-command",
});

const policyRepository = new PolicyRuleRepository(db);

/**
 * Flags a GameBanana upload that is only a gameinfo.gi performance config, so
 * the desktop app opens it in Performance instead of installing it as a mod.
 * Uploads that also ship VPKs stay installable: the download flow installs the
 * VPKs and offers to import the config.
 */
export class PerfConfigCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("perfconfig")
        .setDescription("Mark GameBanana uploads that are performance configs")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription(
              "For config-only uploads (no VPKs): open in Performance instead of installing",
            )
            .addStringOption((option) =>
              option
                .setName("mod_id_or_url")
                .setDescription("GameBanana mod ID or URL")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Treat this upload as a regular mod again")
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
    const { member, user } = interaction;
    if (
      !(member instanceof GuildMember) ||
      !hasPerfConfigModerationPermission(member)
    ) {
      return interaction.reply({
        content:
          "Only moderators, core contributors and community support can use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const modIdOrUrl = interaction.options.getString("mod_id_or_url", true);

    let identity: PolicyIdentity;
    try {
      identity = parsePolicyIdentity(modIdOrUrl);
    } catch {
      return interaction.reply({
        content: "That isn't a GameBanana mod ID or URL.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (identity.submissionType !== "mod") {
      return interaction.reply({
        content: "Performance configs are GameBanana mods, not sounds.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const existing = await policyRepository.find(
        identity,
        "metadata_correction",
      );
      const correction = existing?.correction ?? null;
      const flagged = isPerformanceConfigCorrection(correction);
      const label = `mod \`${identity.submissionId}\``;

      if (subcommand === "add") {
        if (flagged) {
          return interaction.reply({
            content: `${label} is already marked as a performance config.`,
          });
        }
        await policyRepository.upsert({
          ...identity,
          kind: "metadata_correction",
          correction: withPerformanceConfigCategory(correction),
          createdBy: user.id,
        });
      } else {
        if (!flagged) {
          return interaction.reply({
            content: `${label} isn't marked as a performance config.`,
          });
        }
        const rest = withoutPerformanceConfigCategory(correction);
        if (rest) {
          await policyRepository.upsert({
            ...identity,
            kind: "metadata_correction",
            correction: rest,
            createdBy: user.id,
          });
        } else {
          await policyRepository.delete(identity, "metadata_correction");
        }
      }

      logger
        .withMetadata({
          userId: user.id,
          username: user.username,
          subcommand,
          submissionId: identity.submissionId,
        })
        .info("Updated performance config flag");

      return interaction.reply({
        content:
          subcommand === "add"
            ? `Marked ${label} as a performance config. The app opens it in Performance once its policy list refreshes.`
            : `${label} is a regular mod again.`,
      });
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ userId: user.id, subcommand, modIdOrUrl })
        .error("Error in perfconfig command");
      return interaction.reply({
        content: "An error occurred while processing the request.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
