import type { QuickAnswerTemplate } from "@deadlock-mods/database";
import {
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  QUICK_ANSWER_MAX_ASSETS,
  QUICK_ANSWER_MAX_BODY_LENGTH,
  QUICK_ANSWER_MAX_TITLE_LENGTH,
} from "../lib/quick-answer-validation";

export const QUICK_ANSWER_MODAL_FIELDS = {
  slug: "quickanswer-slug",
  title: "quickanswer-title",
  body: "quickanswer-body",
  media: "quickanswer-media",
};

export function buildQuickAnswerSetupModal(customId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle("Create Quick Answer")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Slug")
        .setDescription("Lowercase letters, numbers, and hyphens")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(QUICK_ANSWER_MODAL_FIELDS.slug)
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(50)
            .setPlaceholder("installation")
            .setRequired(true),
        ),
      createTitleLabel(),
      createBodyLabel(),
      createMediaLabel(false),
    );
}

export function buildQuickAnswerEditModal(
  customId: string,
  template: QuickAnswerTemplate,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(`Edit ${template.slug}`.slice(0, 45))
    .addLabelComponents(
      createTitleLabel(template.title),
      createBodyLabel(template.body),
    );
}

export function buildQuickAnswerMediaModal(customId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle("Add Quick Answer Media")
    .addLabelComponents(createMediaLabel(true));
}

function createTitleLabel(value?: string): LabelBuilder {
  const input = new TextInputBuilder()
    .setCustomId(QUICK_ANSWER_MODAL_FIELDS.title)
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(QUICK_ANSWER_MAX_TITLE_LENGTH)
    .setPlaceholder("Installation help")
    .setRequired(true);

  if (value) {
    input.setValue(value);
  }

  return new LabelBuilder().setLabel("Title").setTextInputComponent(input);
}

function createBodyLabel(value?: string): LabelBuilder {
  const input = new TextInputBuilder()
    .setCustomId(QUICK_ANSWER_MODAL_FIELDS.body)
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(QUICK_ANSWER_MAX_BODY_LENGTH)
    .setPlaceholder("Enter the complete answer shown to users")
    .setRequired(true);

  if (value) {
    input.setValue(value);
  }

  return new LabelBuilder().setLabel("Answer").setTextInputComponent(input);
}

function createMediaLabel(required: boolean): LabelBuilder {
  return new LabelBuilder()
    .setLabel("Images or videos")
    .setDescription(
      required
        ? "Upload 1-3 files, 10 MiB each, 20 MiB total"
        : "Optional. Up to 3 files, 10 MiB each, 20 MiB total",
    )
    .setFileUploadComponent((upload) =>
      upload
        .setCustomId(QUICK_ANSWER_MODAL_FIELDS.media)
        .setMinValues(required ? 1 : 0)
        .setMaxValues(QUICK_ANSWER_MAX_ASSETS)
        .setRequired(required),
    );
}
