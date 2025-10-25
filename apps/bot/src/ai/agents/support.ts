import type { BaseError } from "@deadlock-mods/common";
import { RuntimeError } from "@deadlock-mods/common";
import { HumanMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  RunnableSequence,
  RunnableWithMessageHistory,
} from "@langchain/core/runnables";
import { ConsoleCallbackHandler } from "@langchain/core/tracers/console";
import { CallbackHandler } from "@langfuse/langchain";
import { okAsync, ResultAsync } from "neverthrow";
import { DrizzleChatMessageHistory } from "@/lib/chat-history";
import { env } from "@/lib/env";
import { createSupportBotPrompt } from "../prompts/support-bot";
import { Agent } from ".";
export class SupportAgent extends Agent {
  private promptCache: Map<string, ChatPromptTemplate> = new Map();

  private getPrompt(
    userMention: string,
  ): ResultAsync<ChatPromptTemplate, BaseError> {
    if (this.promptCache.has(userMention)) {
      return okAsync(this.promptCache.get(userMention)!);
    }

    return createSupportBotPrompt(userMention).andThen((promptResult) => {
      this.promptCache.set(userMention, promptResult.prompt);
      return okAsync(promptResult.prompt);
    });
  }

  invoke(
    message: string,
    sessionId: string,
    userId: string,
    tags: string[],
    channelId: string,
    userMention: string,
  ): ResultAsync<string, BaseError> {
    this.logger
      .withMetadata({ sessionId, userId, tags, channelId, userMention })
      .info("Invoking support agent");

    return this.getPrompt(userMention).andThen((prompt) => {
      const langfuseCallback = new CallbackHandler({
        sessionId,
        userId,
        tags,
      });

      const llmWithCallbacks = this.llm.withRetry({
        stopAfterAttempt: this.config.maxRetries,
      });

      const chain = RunnableSequence.from([
        prompt,
        llmWithCallbacks,
        new StringOutputParser(),
      ]);

      const chatHistory = new DrizzleChatMessageHistory(userId, channelId);

      const chainWithHistory = new RunnableWithMessageHistory({
        runnable: chain,
        getMessageHistory: async () => Promise.resolve(chatHistory),
        inputMessagesKey: "messages",
        historyMessagesKey: "history",
      });

      return ResultAsync.fromPromise(
        chainWithHistory.invoke(
          { messages: [new HumanMessage(message)] },
          {
            configurable: { sessionId },
            callbacks: [
              langfuseCallback,
              ...(env.DEBUG ? [new ConsoleCallbackHandler()] : []),
            ],
          },
        ),
        (error) => {
          this.logger
            .withError(
              error instanceof Error ? error : new Error(String(error)),
            )
            .withMetadata({ sessionId, userId })
            .error("LLM invocation failed");

          return new RuntimeError("Failed to invoke support agent", {
            cause: error,
          });
        },
      ).map((response) => {
        this.logger
          .withMetadata({
            sessionId,
            userId,
            responseLength: response.length,
          })
          .info("Support agent invocation successful");

        return response;
      });
    });
  }
}
