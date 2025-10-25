import { db, MessagePatternRepository } from "@deadlock-mods/database";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Command } from "@sapphire/framework";
import {
  type GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { logger as mainLogger } from "../lib/logger";
import {
  getBlacklistRequiredPermissionsDisplay,
  hasBlacklistPermission,
} from "../lib/permissions";
import { MessageTriageService } from "../services/message-triage";

const logger = mainLogger.child().withContext({
  service: "pattern-command",
});

const patternRepository = new MessagePatternRepository(db, logger);

export class PatternCommand extends Command {
  private embeddings: OpenAIEmbeddings;

  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });

    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("pattern")
        .setDescription("Manage message triage patterns (Administrator only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Add a new message pattern")
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription("Example message text")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("category")
                .setDescription("Pattern category")
                .setRequired(true)
                .addChoices(
                  { name: "Bug Report", value: "bug_report" },
                  { name: "Help Request", value: "help_request" },
                ),
            )
            .addStringOption((option) =>
              option
                .setName("source")
                .setDescription("Source of this pattern (optional)")
                .setRequired(false),
            ),
        ),
    );
  }

  override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const { user, member } = interaction;

    if (!hasBlacklistPermission(user, member as GuildMember)) {
      return interaction.reply({
        content: `You don't have permission to use this command. Required: ${getBlacklistRequiredPermissionsDisplay()}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      return await this.handleAdd(interaction);
    }
  }

  private async handleAdd(interaction: Command.ChatInputCommandInteraction) {
    const message = interaction.options.getString("message", true);
    const category = interaction.options.getString("category", true) as
      | "bug_report"
      | "help_request";
    const source = interaction.options.getString("source") ?? "discord_command";

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      logger
        .withMetadata({
          userId: interaction.user.id,
          username: interaction.user.username,
          category,
          messageLength: message.length,
        })
        .info("Adding new message pattern");

      const embedding = await this.embeddings.embedQuery(message);

      const result = await patternRepository.createMany([
        {
          patternType: category,
          patternText: message,
          embedding,
          metadata: {
            source,
            category,
          },
        },
      ]);

      if (result.isErr()) {
        logger
          .withError(result.error)
          .withMetadata({
            userId: interaction.user.id,
            category,
          })
          .error("Failed to create message pattern");

        return interaction.editReply({
          content: "Failed to add pattern to database. Please try again.",
        });
      }

      const pattern = result.value[0];

      logger
        .withMetadata({
          userId: interaction.user.id,
          username: interaction.user.username,
          patternId: pattern.id,
          category,
        })
        .info("Message pattern added successfully");

      const triageService = MessageTriageService.getInstance();
      await triageService.reload();

      logger.info("Triage service reloaded with new pattern");

      return interaction.editReply({
        content: `✅ Successfully added pattern to **${category === "bug_report" ? "Bug Report" : "Help Request"}** category!\n\n**Pattern:** ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}\n**ID:** \`${pattern.id}\``,
      });
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          userId: interaction.user.id,
          username: interaction.user.username,
          category,
        })
        .error("Error adding message pattern");

      return interaction.editReply({
        content:
          "An error occurred while adding the pattern. Please try again.",
      });
    }
  }
}
