import {
  ConfigurationError,
  NotFoundError,
  RuntimeError,
  ValidationError,
} from "@deadlock-mods/common";
import { db, QuickAnswerRepository } from "@deadlock-mods/database";
import { Command } from "@sapphire/framework";
import {
  type ChatInputCommandInteraction,
  MessageFlags,
  type ModalSubmitInteraction,
  type RepliableInteraction,
} from "discord.js";
import { logger as mainLogger } from "../lib/logger";
import {
  getQuickAnswerEditorRolesDisplay,
  getQuickAnswerUserRolesDisplay,
  hasQuickAnswerEditorPermission,
  hasQuickAnswerUsePermission,
} from "../lib/permissions";
import {
  normalizeQuickAnswerSlug,
  validateQuickAnswerText,
} from "../lib/quick-answer-validation";
import { QuickAnswerAssetService } from "../services/quick-answer-assets";
import {
  buildQuickAnswerEditModal,
  buildQuickAnswerMediaModal,
  buildQuickAnswerSetupModal,
  QUICK_ANSWER_MODAL_FIELDS,
} from "../services/quick-answer-modals";
import { buildQuickAnswerEmbed } from "../services/quick-answer-renderer";

const logger = mainLogger.child().withContext({
  service: "quick-answer-command",
});

const repository = new QuickAnswerRepository(db, logger);
const assetService = new QuickAnswerAssetService();
const EDITOR_SUBCOMMANDS = new Set([
  "setup",
  "edit",
  "media-add",
  "media-remove",
  "delete",
]);

export class QuickAnswerCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("quickanswer")
        .setDescription("Create and send reusable support answers")
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("setup")
            .setDescription("Create a quick answer template"),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("answer")
            .setDescription("Send a quick answer in this channel")
            .addStringOption((option) =>
              option
                .setName("template")
                .setDescription("Template slug or title")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("preview")
            .setDescription("Preview a quick answer privately")
            .addStringOption((option) =>
              option
                .setName("template")
                .setDescription("Template slug or title")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("edit")
            .setDescription("Edit a quick answer template")
            .addStringOption((option) =>
              option
                .setName("template")
                .setDescription("Template slug or title")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("media-add")
            .setDescription("Add images or videos to a template")
            .addStringOption((option) =>
              option
                .setName("template")
                .setDescription("Template slug or title")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("media-remove")
            .setDescription("Remove an image or video from a template")
            .addStringOption((option) =>
              option
                .setName("template")
                .setDescription("Template slug or title")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((option) =>
              option
                .setName("asset")
                .setDescription("Media file to remove")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("delete")
            .setDescription("Delete a quick answer template")
            .addStringOption((option) =>
              option
                .setName("template")
                .setDescription("Template slug or title")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        ),
    );
  }

  override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
    if (!interaction.inCachedGuild()) {
      return interaction.respond([]);
    }

    const subcommand = interaction.options.getSubcommand();
    const hasPermission = EDITOR_SUBCOMMANDS.has(subcommand)
      ? hasQuickAnswerEditorPermission(interaction.member)
      : hasQuickAnswerUsePermission(interaction.member);
    if (!hasPermission) {
      return interaction.respond([]);
    }

    try {
      const focused = interaction.options.getFocused(true);
      if (focused.name === "template") {
        const result = await repository.searchActive(
          interaction.guildId,
          focused.value,
        );
        if (result.isErr()) {
          logger.withError(result.error).error("Template autocomplete failed");
          return interaction.respond([]);
        }

        return interaction.respond(
          result.value.map((template) => ({
            name: `${template.title} (${template.slug})`.slice(0, 100),
            value: template.slug,
          })),
        );
      }

      if (focused.name === "asset") {
        const slug = interaction.options.getString("template");
        if (!slug) {
          return interaction.respond([]);
        }

        const result = await repository.findBySlugWithAssets(
          interaction.guildId,
          slug,
        );
        if (result.isErr() || !result.value) {
          return interaction.respond([]);
        }

        const query = focused.value.toLowerCase();
        return interaction.respond(
          result.value.assets
            .filter((asset) => asset.filename.toLowerCase().includes(query))
            .slice(0, 25)
            .map((asset) => ({
              name: `${asset.kind}: ${asset.filename}`.slice(0, 100),
              value: asset.id,
            })),
        );
      }

      return interaction.respond([]);
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ userId: interaction.user.id })
        .warn("Quick answer autocomplete failed");
      return interaction.respond([]).catch(() => undefined);
    }
  }

  override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) {
      return interaction.reply({
        content: "Quick answers can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const requiresEditor = EDITOR_SUBCOMMANDS.has(subcommand);
    const hasPermission = requiresEditor
      ? hasQuickAnswerEditorPermission(interaction.member)
      : hasQuickAnswerUsePermission(interaction.member);

    if (!hasPermission) {
      const requiredRoles = requiresEditor
        ? getQuickAnswerEditorRolesDisplay()
        : getQuickAnswerUserRolesDisplay();
      return interaction.reply({
        content: `You don't have permission to use this command. Required: ${requiredRoles}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }

    try {
      switch (subcommand) {
        case "setup":
          return await this.handleSetup(interaction);
        case "answer":
          return await this.handleAnswer(interaction, false);
        case "preview":
          return await this.handleAnswer(interaction, true);
        case "edit":
          return await this.handleEdit(interaction);
        case "media-add":
          return await this.handleMediaAdd(interaction);
        case "media-remove":
          return await this.handleMediaRemove(interaction);
        case "delete":
          return await this.handleDelete(interaction);
        default:
          throw new ValidationError("Unsupported quick answer action");
      }
    } catch (error) {
      const handledError =
        error instanceof Error
          ? error
          : new RuntimeError("Unexpected quick answer failure", error);
      return await this.replyWithError(interaction, handledError);
    }
  }

  private async handleSetup(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const modalId = `quickanswer:setup:${interaction.user.id}:${Date.now()}`;
    await interaction.showModal(buildQuickAnswerSetupModal(modalId));
    const submission = await this.awaitModal(interaction, modalId);
    if (!submission) {
      return;
    }

    await submission.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const slug = normalizeQuickAnswerSlug(
        submission.fields.getTextInputValue(QUICK_ANSWER_MODAL_FIELDS.slug),
      );
      const { title, body } = validateQuickAnswerText(
        submission.fields.getTextInputValue(QUICK_ANSWER_MODAL_FIELDS.title),
        submission.fields.getTextInputValue(QUICK_ANSWER_MODAL_FIELDS.body),
      );
      const uploadedFiles = submission.fields.getUploadedFiles(
        QUICK_ANSWER_MODAL_FIELDS.media,
      );
      const attachments = uploadedFiles ? [...uploadedFiles.values()] : [];

      const existing = await repository.findBySlug(interaction.guildId, slug);
      if (existing.isErr()) {
        throw existing.error;
      }
      if (existing.value) {
        throw new ValidationError(`Template \`${slug}\` already exists`);
      }

      const assetInputs = await assetService.store(
        interaction.guild,
        attachments,
        slug,
      );
      const result = await repository.create(
        {
          guildId: interaction.guildId,
          slug,
          title,
          body,
          createdByDiscordId: interaction.user.id,
          updatedByDiscordId: interaction.user.id,
        },
        assetInputs,
      );

      if (result.isErr()) {
        await assetService.deleteMessages(interaction.guild, assetInputs);
        throw result.error;
      }

      logger
        .withMetadata({
          guildId: interaction.guildId,
          templateId: result.value.template.id,
          slug,
          userId: interaction.user.id,
          assetCount: result.value.assets.length,
        })
        .info("Quick answer template created");

      return submission.editReply({
        content: `Created quick answer \`${slug}\` with ${result.value.assets.length} media file(s).`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      const handledError =
        error instanceof Error
          ? error
          : new RuntimeError("Unexpected setup failure", error);
      return await this.replyWithError(submission, handledError);
    }
  }

  private async handleAnswer(
    interaction: ChatInputCommandInteraction<"cached">,
    preview: boolean,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const slug = interaction.options.getString("template", true);
    const result = await repository.findBySlugWithAssets(
      interaction.guildId,
      slug,
    );
    if (result.isErr()) {
      throw result.error;
    }
    if (!result.value) {
      throw new NotFoundError(`Quick answer \`${slug}\` was not found`);
    }

    const { template, assets } = result.value;
    const files = await assetService.resolve(interaction.guild, assets);
    const logoUrl = interaction.client.user.displayAvatarURL({
      extension: "png",
      size: 128,
    });
    const response = {
      embeds: [buildQuickAnswerEmbed(template, assets, logoUrl)],
      files,
      allowedMentions: { parse: [] },
    };

    if (preview) {
      return interaction.editReply(response);
    }

    if (!interaction.channel?.isSendable()) {
      throw new ConfigurationError(
        "The current channel does not allow the bot to send messages",
      );
    }

    await interaction.channel.send(response);
    const usageResult = await repository.recordUsage(template.id);
    if (usageResult.isErr()) {
      logger
        .withError(usageResult.error)
        .withMetadata({ templateId: template.id })
        .warn("Quick answer sent but usage could not be recorded");
    }

    logger
      .withMetadata({
        guildId: interaction.guildId,
        templateId: template.id,
        slug: template.slug,
        userId: interaction.user.id,
        channelId: interaction.channelId,
      })
      .info("Quick answer sent");

    return interaction.editReply({
      content: `Sent quick answer \`${template.slug}\`.`,
      allowedMentions: { parse: [] },
    });
  }

  private async handleEdit(interaction: ChatInputCommandInteraction<"cached">) {
    const slug = interaction.options.getString("template", true);
    const existing = await repository.findBySlug(interaction.guildId, slug);
    if (existing.isErr()) {
      throw existing.error;
    }
    if (!existing.value) {
      throw new NotFoundError(`Quick answer \`${slug}\` was not found`);
    }

    const modalId = `quickanswer:edit:${interaction.user.id}:${Date.now()}`;
    await interaction.showModal(
      buildQuickAnswerEditModal(modalId, existing.value),
    );
    const submission = await this.awaitModal(interaction, modalId);
    if (!submission) {
      return;
    }

    await submission.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const { title, body } = validateQuickAnswerText(
        submission.fields.getTextInputValue(QUICK_ANSWER_MODAL_FIELDS.title),
        submission.fields.getTextInputValue(QUICK_ANSWER_MODAL_FIELDS.body),
      );
      const result = await repository.updateContent(
        existing.value.id,
        title,
        body,
        interaction.user.id,
      );
      if (result.isErr()) {
        throw result.error;
      }

      return submission.editReply({
        content: `Updated quick answer \`${slug}\`.`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      const handledError =
        error instanceof Error
          ? error
          : new RuntimeError("Unexpected edit failure", error);
      return await this.replyWithError(submission, handledError);
    }
  }

  private async handleMediaAdd(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const slug = interaction.options.getString("template", true);
    const existing = await repository.findBySlugWithAssets(
      interaction.guildId,
      slug,
    );
    if (existing.isErr()) {
      throw existing.error;
    }
    if (!existing.value) {
      throw new NotFoundError(`Quick answer \`${slug}\` was not found`);
    }

    const modalId = `quickanswer:media:${interaction.user.id}:${Date.now()}`;
    await interaction.showModal(buildQuickAnswerMediaModal(modalId));
    const submission = await this.awaitModal(interaction, modalId);
    if (!submission) {
      return;
    }

    await submission.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const uploadedFiles = submission.fields.getUploadedFiles(
        QUICK_ANSWER_MODAL_FIELDS.media,
        true,
      );
      const attachments = [...uploadedFiles.values()];
      const current = await repository.findBySlugWithAssets(
        interaction.guildId,
        slug,
      );
      if (current.isErr()) {
        throw current.error;
      }
      if (!current.value) {
        throw new NotFoundError(`Quick answer \`${slug}\` was not found`);
      }

      const startSortOrder =
        current.value.assets.reduce(
          (highest, asset) => Math.max(highest, asset.sortOrder),
          -1,
        ) + 1;
      const assetInputs = await assetService.store(
        interaction.guild,
        attachments,
        slug,
        startSortOrder,
        current.value.assets.map((asset) => asset.sizeBytes),
      );
      const result = await repository.addAssets(
        current.value.template.id,
        assetInputs,
      );

      if (result.isErr()) {
        await assetService.deleteMessages(interaction.guild, assetInputs);
        throw result.error;
      }

      return submission.editReply({
        content: `Added ${result.value.length} media file(s) to \`${slug}\`.`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      const handledError =
        error instanceof Error
          ? error
          : new RuntimeError("Unexpected media upload failure", error);
      return await this.replyWithError(submission, handledError);
    }
  }

  private async handleMediaRemove(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const slug = interaction.options.getString("template", true);
    const assetId = interaction.options.getString("asset", true);
    const existing = await repository.findBySlugWithAssets(
      interaction.guildId,
      slug,
    );
    if (existing.isErr()) {
      throw existing.error;
    }
    if (!existing.value) {
      throw new NotFoundError(`Quick answer \`${slug}\` was not found`);
    }

    const asset = existing.value.assets.find((item) => item.id === assetId);
    if (!asset) {
      throw new NotFoundError(`Media file \`${assetId}\` was not found`);
    }

    const result = await repository.removeAsset(
      existing.value.template.id,
      asset.id,
    );
    if (result.isErr()) {
      throw result.error;
    }

    await assetService.deleteMessages(interaction.guild, [asset]);
    return interaction.editReply({
      content: `Removed \`${asset.filename}\` from \`${slug}\`.`,
      allowedMentions: { parse: [] },
    });
  }

  private async handleDelete(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const slug = interaction.options.getString("template", true);
    const existing = await repository.findBySlugWithAssets(
      interaction.guildId,
      slug,
    );
    if (existing.isErr()) {
      throw existing.error;
    }
    if (!existing.value) {
      throw new NotFoundError(`Quick answer \`${slug}\` was not found`);
    }

    const result = await repository.deleteTemplate(existing.value.template.id);
    if (result.isErr()) {
      throw result.error;
    }

    await assetService.deleteMessages(interaction.guild, existing.value.assets);
    return interaction.editReply({
      content: `Deleted quick answer \`${slug}\`.`,
      allowedMentions: { parse: [] },
    });
  }

  private async awaitModal(
    interaction: ChatInputCommandInteraction<"cached">,
    customId: string,
  ): Promise<ModalSubmitInteraction<"cached"> | null> {
    const submission = await interaction
      .awaitModalSubmit({
        time: 15 * 60 * 1_000,
        filter: (submission) =>
          submission.customId === customId &&
          submission.user.id === interaction.user.id,
      })
      .catch(() => null);

    if (!submission) {
      return null;
    }

    // Re-check editor authorization: roles may have been revoked between
    // showing the modal and its (up to 15 minute) submission window.
    if (!hasQuickAnswerEditorPermission(submission.member)) {
      await submission
        .reply({
          content: `You don't have permission to use this command. Required: ${getQuickAnswerEditorRolesDisplay()}`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        })
        .catch(() => undefined);
      return null;
    }

    return submission;
  }

  private async replyWithError(
    interaction: RepliableInteraction,
    error: Error,
  ) {
    logger
      .withError(error)
      .withMetadata({
        userId: interaction.user.id,
        guildId: interaction.guildId,
      })
      .error("Quick answer command failed");

    const content =
      error instanceof ValidationError ||
      error instanceof ConfigurationError ||
      error instanceof NotFoundError
        ? error.message
        : "Quick answer failed. Please try again or check the bot logs.";

    if (interaction.deferred) {
      return interaction.editReply({
        content,
        embeds: [],
        files: [],
        allowedMentions: { parse: [] },
      });
    }

    if (!interaction.replied) {
      return interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }
  }
}
