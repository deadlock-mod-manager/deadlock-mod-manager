import {
  db,
  ModRepository,
  type PolicyIdentity,
} from "@deadlock-mods/database";
import { Command } from "@sapphire/framework";
import {
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  time,
  TimestampStyles,
} from "discord.js";
import { logger as mainLogger } from "../lib/logger";
import { parsePolicyIdentity } from "../lib/policy-identity";
import { FeatureFlagsService } from "../services/feature-flags";

const logger = mainLogger.child().withContext({
  service: "mod-of-the-week-command",
});

const modRepository = new ModRepository(db);

const ID_FLAG = "mod-of-the-week-id";
const UNTIL_FLAG = "mod-of-the-week-until";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pins a mod as mod of the week on the desktop dashboard for a number of
 * days. The desktop reads the pin from the `mod-of-the-week-*` feature flags.
 */
export class ModOfTheWeekCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("modoftheweek")
        .setDescription("Pin the app's mod of the week (Administrator only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("set")
            .setDescription("Pin a mod as mod of the week for a few days")
            .addStringOption((option) =>
              option
                .setName("mod_id_or_url")
                .setDescription("GameBanana mod/sound ID or URL")
                .setRequired(true),
            )
            .addIntegerOption((option) =>
              option
                .setName("days")
                .setDescription("How long to pin it (default 7)")
                .setMinValue(1)
                .setMaxValue(30),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("clear")
            .setDescription("Go back to the weekly rotation"),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName("status").setDescription("Show the current pin"),
        ),
    );
  }

  override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const { member, user } = interaction;
    if (
      !(member instanceof GuildMember) ||
      !member.permissions.has("Administrator")
    ) {
      return interaction.reply({
        content: "Only server administrators can use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const featureFlagService = FeatureFlagsService.instance.getService();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const [idFlag, untilFlag] = await Promise.all([
        featureFlagService.findByName(ID_FLAG),
        featureFlagService.findByName(UNTIL_FLAG),
      ]);
      if (idFlag.isErr()) throw idFlag.error;
      if (untilFlag.isErr()) throw untilFlag.error;

      const setPin = async (id: string, until: string) => {
        for (const [flagId, value] of [
          [untilFlag.value.id, until],
          [idFlag.value.id, id],
        ]) {
          const result = await featureFlagService.updateFeatureFlag(flagId, {
            value,
          });
          if (result.isErr()) throw result.error;
        }
      };

      if (subcommand === "status") {
        const id = String(idFlag.value.value ?? "");
        const until = Date.parse(String(untilFlag.value.value ?? ""));
        if (!id || Number.isNaN(until) || until <= Date.now()) {
          return interaction.editReply({
            content:
              "No mod of the week is pinned. The app uses the weekly rotation.",
          });
        }
        return interaction.editReply({
          content: `Mod \`${id}\` is pinned until ${time(new Date(until), TimestampStyles.LongDateTime)}.`,
        });
      }

      if (subcommand === "clear") {
        await setPin("", "");
        logger
          .withMetadata({ userId: user.id, username: user.username })
          .info("Cleared mod of the week");
        return interaction.editReply({
          content:
            "Cleared the mod of the week. The app is back on the weekly rotation.",
        });
      }

      const modIdOrUrl = interaction.options.getString("mod_id_or_url", true);
      const days = interaction.options.getInteger("days") ?? 7;

      let identity: PolicyIdentity;
      try {
        identity = parsePolicyIdentity(modIdOrUrl);
      } catch {
        return interaction.editReply({
          content: "That isn't a GameBanana mod ID or URL.",
        });
      }
      const mod = await modRepository.findBySubmissionIdentity(
        identity.submissionType,
        identity.submissionId,
      );
      if (!mod) {
        return interaction.editReply({
          content: "That mod isn't in the catalog yet, or it's blacklisted.",
        });
      }
      if (mod.isNSFW) {
        return interaction.editReply({
          content: "NSFW mods can't be mod of the week.",
        });
      }

      const until = new Date(Date.now() + days * DAY_MS);
      await setPin(mod.remoteId, until.toISOString());

      logger
        .withMetadata({
          userId: user.id,
          username: user.username,
          remoteId: mod.remoteId,
          until: until.toISOString(),
        })
        .info("Set mod of the week");

      return interaction.editReply({
        content: `**${mod.name}** is mod of the week until ${time(until, TimestampStyles.LongDateTime)}. The app picks it up within a few minutes.`,
      });
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ userId: user.id, subcommand })
        .error("Error in modoftheweek command");
      return interaction.editReply({
        content: "An error occurred while processing the request.",
      });
    }
  }
}
