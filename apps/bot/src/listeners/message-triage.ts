import { Listener } from "@sapphire/framework";
import type { Message } from "discord.js";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";
import { MessageTriageService } from "@/services/message-triage";

const logger = mainLogger.child().withContext({
  service: "message-triage-listener",
});

export class MessageTriageListener extends Listener {
  private triageService: MessageTriageService;
  private excludedChannels: Set<string>;

  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
  ) {
    super(context, {
      ...options,
      event: "messageCreate",
    });

    this.triageService = MessageTriageService.getInstance();
    this.excludedChannels = new Set([
      env.REPORTS_CHANNEL_ID,
      env.FORUM_CHANNEL_ID,
      env.SUPPORT_CHANNEL_ID,
      env.BUG_REPORT_CHANNEL_ID,
    ]);

    this.initializeService();
  }

  private async initializeService() {
    try {
      await this.triageService.initialize();
      logger.info("Message triage service initialized");
    } catch (error) {
      logger
        .withError(error)
        .error("Failed to initialize message triage service");
    }
  }

  private shouldProcess(message: Message): boolean {
    if (message.author.bot) {
      return false;
    }

    if (this.excludedChannels.has(message.channelId)) {
      return false;
    }

    if (message.channel.isThread() && message.channel.parentId) {
      if (this.excludedChannels.has(message.channel.parentId)) {
        return false;
      }
    }

    if (message.reference?.messageId) {
      return false;
    }

    return true;
  }

  public async run(message: Message) {
    if (!this.shouldProcess(message)) {
      return;
    }

    const classificationResult = await this.triageService.classifyMessage(
      message.content,
      message.author.id,
    );

    if (!classificationResult.success) {
      logger
        .withMetadata({
          messageId: message.id,
          userId: message.author.id,
          reason: classificationResult.reason,
        })
        .debug("Classification skipped");
      return;
    }

    const { result } = classificationResult;

    if (result.type === "normal") {
      return;
    }

    logger
      .withMetadata({
        messageId: message.id,
        userId: message.author.id,
        channelId: message.channelId,
        classification: result.type,
        confidence: result.confidence,
      })
      .info("Message classified for redirection");

    try {
      const channelMention = result.suggestedChannelId
        ? `<#${result.suggestedChannelId}>`
        : result.type === "bug_report"
          ? "the bug reports channel"
          : "the support channel";

      const messageType =
        result.type === "bug_report" ? "reporting a bug" : "asking for help";

      await message.reply({
        content: `Hey! 👋 It looks like you're ${messageType}. Please post in ${channelMention} so our team can assist you better!`,
      });

      logger
        .withMetadata({
          messageId: message.id,
          userId: message.author.id,
          classification: result.type,
        })
        .info("Sent triage redirect message");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          messageId: message.id,
          userId: message.author.id,
        })
        .error("Failed to send triage redirect message");
    }
  }
}
