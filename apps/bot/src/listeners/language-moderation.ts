import { Listener } from "@sapphire/framework";
import { PermissionFlagsBits, type Message } from "discord.js";
import {
  isLanguageModerationChannel,
  type LanguageModerationConfig,
} from "@/config/language-moderation";
import { env } from "@/lib/env";
import { createLanguageDetector } from "@/lib/language-detection";
import { logger as mainLogger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { LanguageModerationService } from "@/services/language-moderation";
import { RedisLanguageWarningStore } from "@/services/language-warnings";

const logger = mainLogger
  .child()
  .withContext({ service: "language-moderation" });

const config: LanguageModerationConfig = {
  enabled: env.LANGUAGE_MODERATION_ENABLED,
  guildId: env.DMM_GUILD_ID,
  channelIds: env.LANGUAGE_MODERATION_CHANNEL_IDS,
  ignoredChannelIds: env.LANGUAGE_MODERATION_IGNORED_CHANNEL_IDS,
  maxWarnings: env.LANGUAGE_MODERATION_MAX_WARNINGS,
  windowMinutes: env.LANGUAGE_MODERATION_WINDOW_MINUTES,
};

export class LanguageModerationListener extends Listener {
  private service?: Promise<LanguageModerationService>;

  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, { ...options, event: "messageCreate" });
  }

  private async createService() {
    try {
      return new LanguageModerationService(
        config,
        await createLanguageDetector(),
        new RedisLanguageWarningStore(redis),
      );
    } catch (error) {
      this.service = undefined;
      throw error;
    }
  }

  async run(message: Message) {
    if (
      message.author.bot ||
      message.webhookId ||
      message.system ||
      !message.inGuild()
    )
      return;
    const parentId = message.channel.isThread()
      ? message.channel.parentId
      : null;
    if (
      !isLanguageModerationChannel(
        config,
        message.guildId,
        message.channelId,
        parentId,
      )
    )
      return;

    const botUser = this.container.client.user;
    if (!botUser) return;
    const permissions = message.channel.permissionsFor(botUser);
    const sendPermission = message.channel.isThread()
      ? PermissionFlagsBits.SendMessagesInThreads
      : PermissionFlagsBits.SendMessages;
    if (
      !permissions?.has([
        PermissionFlagsBits.ViewChannel,
        sendPermission,
        PermissionFlagsBits.ReadMessageHistory,
      ])
    ) {
      logger
        .withMetadata({ channelId: message.channelId })
        .warn("Missing permissions to deliver language warnings");
      return;
    }

    try {
      this.service ??= this.createService();
      const service = await this.service;
      const result = await service.moderate({
        id: message.id,
        guildId: message.guildId,
        authorId: message.author.id,
        content: message.content,
        deletable: message.deletable,
        reply: async (content) => {
          await message.reply({
            content,
            allowedMentions: { parse: [], repliedUser: false },
          });
        },
        delete: async () => {
          await message.delete();
        },
      });
      if (result)
        logger
          .withMetadata({
            messageId: message.id,
            userId: message.author.id,
            channelId: message.channelId,
            ...result,
          })
          .info("Language moderation action");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ messageId: message.id, channelId: message.channelId })
        .error("Failed to moderate message language");
    }
  }
}
