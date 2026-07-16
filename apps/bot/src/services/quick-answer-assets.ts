import {
  ConfigurationError,
  NotFoundError,
  ProviderError,
} from "@deadlock-mods/common";
import type {
  NewQuickAnswerAsset,
  QuickAnswerAsset,
} from "@deadlock-mods/database";
import {
  type Attachment,
  ChannelType,
  type Guild,
  PermissionFlagsBits,
  type TextChannel,
} from "discord.js";
import { env } from "../lib/env";
import { logger as mainLogger } from "../lib/logger";
import {
  type ValidatedQuickAnswerUpload,
  validateQuickAnswerUploads,
} from "../lib/quick-answer-validation";

const logger = mainLogger.child().withContext({
  service: "quick-answer-assets",
});

export interface ResolvedQuickAnswerFile {
  readonly attachment: string;
  readonly name: string;
}

export type QuickAnswerAssetInput = Omit<
  NewQuickAnswerAsset,
  "id" | "templateId"
>;

export class QuickAnswerAssetService {
  async store(
    guild: Guild,
    attachments: readonly Attachment[],
    slug: string,
    startSortOrder = 0,
    existingAssetSizes: readonly number[] = [],
  ): Promise<QuickAnswerAssetInput[]> {
    const uploads = validateQuickAnswerUploads(attachments, existingAssetSizes);
    if (uploads.length === 0) {
      return [];
    }

    const channel = await this.getAssetChannel(guild);
    const createdMessageIds: string[] = [];

    try {
      const storedAssets: QuickAnswerAssetInput[] = [];

      for (const [index, upload] of uploads.entries()) {
        const message = await channel.send({
          content: [
            "Quick Answer asset",
            `Template: \`${slug}\``,
            "Managed by the bot. Do not edit or delete this message.",
          ].join("\n"),
          files: [
            {
              attachment: upload.upload.url,
              name: upload.storageFilename,
            },
          ],
          allowedMentions: { parse: [] },
        });
        createdMessageIds.push(message.id);

        const storedAttachment = message.attachments.first();
        if (!storedAttachment) {
          throw new ProviderError(
            `Discord did not return the uploaded attachment for ${upload.upload.name}`,
          );
        }

        storedAssets.push(
          this.toAssetInput(
            upload,
            channel.id,
            message.id,
            storedAttachment.id,
            storedAttachment.name,
            startSortOrder + index,
          ),
        );
      }

      return storedAssets;
    } catch (error) {
      await Promise.all(
        createdMessageIds.map((messageId) =>
          channel.messages.delete(messageId).catch(() => undefined),
        ),
      );
      throw new ProviderError(
        "Could not store quick answer media in Discord",
        error,
      );
    }
  }

  async resolve(
    guild: Guild,
    assets: readonly QuickAnswerAsset[],
  ): Promise<ResolvedQuickAnswerFile[]> {
    const files: ResolvedQuickAnswerFile[] = [];

    for (const asset of assets) {
      const channel = await guild.channels.fetch(asset.channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        throw new NotFoundError(
          `Quick answer asset channel ${asset.channelId} is unavailable`,
        );
      }

      const message = await channel.messages.fetch(asset.messageId);
      const attachment = message.attachments.get(asset.attachmentId);
      if (!attachment) {
        throw new NotFoundError(
          `Quick answer attachment ${asset.attachmentId} is unavailable`,
        );
      }

      files.push({
        attachment: attachment.url,
        name: asset.filename,
      });
    }

    return files;
  }

  async deleteMessages(
    guild: Guild,
    assets: readonly Pick<QuickAnswerAsset, "channelId" | "messageId">[],
  ): Promise<void> {
    for (const asset of assets) {
      try {
        const channel = await guild.channels.fetch(asset.channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
          logger
            .withMetadata({
              channelId: asset.channelId,
              messageId: asset.messageId,
            })
            .warn("Could not delete quick answer asset from missing channel");
          continue;
        }

        await channel.messages.delete(asset.messageId);
      } catch (error) {
        logger
          .withError(error)
          .withMetadata({
            channelId: asset.channelId,
            messageId: asset.messageId,
          })
          .warn("Could not delete quick answer asset message");
      }
    }
  }

  private async getAssetChannel(guild: Guild): Promise<TextChannel> {
    if (!env.QUICKANSWER_ASSET_CHANNEL_ID) {
      throw new ConfigurationError(
        "QUICKANSWER_ASSET_CHANNEL_ID is not configured",
      );
    }

    const channel = await guild.channels.fetch(
      env.QUICKANSWER_ASSET_CHANNEL_ID,
    );
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new ConfigurationError(
        "QUICKANSWER_ASSET_CHANNEL_ID must reference a text channel in this server",
      );
    }

    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const permissions = channel.permissionsFor(botMember);
    const requiredPermissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
    ];

    if (!permissions.has(requiredPermissions)) {
      throw new ConfigurationError(
        "The bot needs View Channel, Read Message History, Send Messages, and Attach Files in the quick answer asset channel",
      );
    }

    return channel;
  }

  private toAssetInput(
    upload: ValidatedQuickAnswerUpload,
    channelId: string,
    messageId: string,
    attachmentId: string,
    filename: string,
    sortOrder: number,
  ): QuickAnswerAssetInput {
    return {
      kind: upload.kind,
      channelId,
      messageId,
      attachmentId,
      filename,
      contentType: upload.contentType,
      sizeBytes: upload.upload.size,
      sortOrder,
    };
  }
}
