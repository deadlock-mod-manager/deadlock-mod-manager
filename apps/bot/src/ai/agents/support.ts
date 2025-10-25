import type { BaseError } from "@deadlock-mods/common";
import { RuntimeError } from "@deadlock-mods/common";
import { HumanMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { CallbackHandler } from "@langfuse/langchain";
import { okAsync, ResultAsync } from "neverthrow";
import { createSupportBotPrompt } from "../prompts/support-bot";
import { Agent } from ".";

export class SupportAgent extends Agent {
  private promptCache?: ChatPromptTemplate;

  private getPrompt(): ResultAsync<ChatPromptTemplate, BaseError> {
    if (this.promptCache) {
      return okAsync(this.promptCache);
    }

    return createSupportBotPrompt().andThen((promptResult) => {
      this.promptCache = promptResult.prompt;
      return okAsync(this.promptCache);
    });
  }

  invoke(
    message: string,
    sessionId: string,
    userId: string,
    tags: string[],
  ): ResultAsync<string, BaseError> {
    this.logger
      .withMetadata({ sessionId, userId, tags })
      .info("Invoking support agent");

    return this.getPrompt().andThen((prompt) => {
      const langfuseCallback = new CallbackHandler({
        sessionId,
        userId,
        tags,
      });

      const llmWithCallbacks = this.llm
        .withConfig({ callbacks: [langfuseCallback] })
        .withRetry({
          stopAfterAttempt: this.config.maxRetries,
        });

      const chain = RunnableSequence.from([
        prompt,
        llmWithCallbacks,
        new StringOutputParser(),
      ]);

      return ResultAsync.fromPromise(
        chain.invoke({ messages: [new HumanMessage(message)] }),
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
