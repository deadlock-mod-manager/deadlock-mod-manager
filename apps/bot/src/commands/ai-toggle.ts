import { Command } from "@sapphire/framework";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { logger as mainLogger } from "../lib/logger";
import { FeatureFlagsService } from "../services/feature-flags";

const logger = mainLogger.child().withContext({
  service: "ai-toggle-command",
});

export class AiToggleCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("ai")
        .setDescription("Manage AI reply functionality (Administrator only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("enable")
            .setDescription("Enable AI-powered replies"),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("disable")
            .setDescription("Disable AI-powered replies"),
        ),
    );
  }

  override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const { user } = interaction;
    const subcommand = interaction.options.getSubcommand();

    try {
      const featureFlagService = FeatureFlagsService.instance.getService();
      const featureFlagResult =
        await featureFlagService.findByName("ai_replies_enabled");

      if (featureFlagResult.isErr()) {
        logger
          .withError(featureFlagResult.error)
          .withMetadata({
            userId: user.id,
            username: user.username,
          })
          .error("Failed to find ai_replies_enabled feature flag");

        return interaction.reply({
          content: "An error occurred while processing the request.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const featureFlag = featureFlagResult.value;
      const newValue = subcommand === "enable";

      if (featureFlag.value === newValue) {
        return interaction.reply({
          content: `AI replies are already ${subcommand === "enable" ? "enabled" : "disabled"}.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await featureFlagService.updateFeatureFlag(featureFlag.id, {
        value: newValue,
      });

      logger
        .withMetadata({
          userId: user.id,
          username: user.username,
          action: subcommand,
          newValue,
        })
        .info("AI replies toggled");

      return interaction.reply({
        content: `AI replies have been ${subcommand === "enable" ? "enabled" : "disabled"}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          userId: user.id,
          username: user.username,
          subcommand,
        })
        .error("Error in AI toggle command");

      return interaction.reply({
        content: "An error occurred while processing the request.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
