import { runWithWideEvent, logger, wideEventContext } from "@/lib/logger";
import { getHeuristicIntent } from "@/listeners/messages/message-triage-heuristics";
import { IntentClassifier, type IntentLabel } from "@/nlp/intent-classifier";
import { container } from "tsyringe";
import { Listener } from "@sapphire/framework";
import type { Message } from "discord.js";

const CONFIDENCE_THRESHOLD = 0.5;

const TRIAGE_SOURCE_CHANNEL_IDS = new Set([
  "1322369721546309685",
  "1412724282534006814",
  "1452252009687289966",
  "1414203136939135067",
  "1419280242870063226",
]);

const TRIAGE_CHANNEL_BY_INTENT: Partial<Record<IntentLabel, string>> = {
  "help request": "1418618964925480990",
  "bug report": "1418618964925480990",
  "feature request": "1414240008394772624",
  "commission request": "1486466823120486430",
  "mod showcase": "1412799289301925908",
  "modding question": "1412799448932679863",
  "linux support": "1470108603598766304",
  "error or crash log": "1418618964925480990",
};

export class MessageTriageListener extends Listener {
  private readonly intentClassifier: IntentClassifier;

  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
  ) {
    super(context, {
      ...options,
      event: "messageCreate",
    });

    this.intentClassifier = container.resolve(IntentClassifier);
    this.intentClassifier.initialize();
  }

  private shouldProcess(message: Message): boolean {
    if (message.author.bot) return false;
    if (!TRIAGE_SOURCE_CHANNEL_IDS.has(message.channelId)) return false;
    if (message.channel.isThread()) return false;
    if (message.reference?.messageId) return false;
    return true;
  }

  public async run(message: Message) {
    await runWithWideEvent(
      wideEventContext,
      logger,
      "discord_message",
      {
        service: "message-triage-listener",
        userId: message.author.id,
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
      },
      async (wide) => {
        if (!this.shouldProcess(message)) return;

        const heuristicIntent = getHeuristicIntent(message.content);

        if (heuristicIntent !== null) {
          wide.merge({
            triageSource: "heuristic",
            triageTopLabel: heuristicIntent,
          });
          return this.redirect(message, heuristicIntent, wide);
        }

        let result;
        try {
          result = await this.intentClassifier.classify(message.content);
        } catch (caught) {
          const error =
            caught instanceof Error ? caught : new Error(String(caught));
          wide.merge({ triageOutcome: "classify_failed" });
          logger.withError(error).error("Message triage classification failed");
          return;
        }

        const [topLabel, topScore] = [result.labels[0], result.scores[0]];
        wide.merge({
          triageSource: "model",
          triageTopLabel: topLabel,
          triageTopScore: topScore,
        });

        if (topScore < CONFIDENCE_THRESHOLD || topLabel === "other") {
          wide.merge({
            triageOutcome:
              topLabel === "other" ? "other_intent" : "below_threshold",
          });
          return;
        }

        return this.redirect(message, topLabel, wide);
      },
    );
  }

  private async redirect(
    message: Message,
    intent: IntentLabel,
    wide: { merge: (data: Record<string, string | number>) => void },
  ): Promise<void> {
    const targetChannelId = TRIAGE_CHANNEL_BY_INTENT[intent];
    if (!targetChannelId) {
      wide.merge({ triageOutcome: "no_target_channel" });
      return;
    }

    const replyText =
      intent === "commission request"
        ? `This looks like it may fit better in <#${targetChannelId}>. You can also use \`/howto\` to learn how commissions work.`
        : `This looks like it may fit better in <#${targetChannelId}>, please post there so the right people can help.`;

    try {
      await message.reply(replyText);
    } catch (caught) {
      const error =
        caught instanceof Error ? caught : new Error(String(caught));
      wide.merge({ triageOutcome: "reply_failed" });
      logger.withError(error).error("Message triage redirect reply failed");
      return;
    }

    wide.merge({
      triageOutcome: "redirected",
      triageTargetChannelId: targetChannelId,
    });
  }
}
