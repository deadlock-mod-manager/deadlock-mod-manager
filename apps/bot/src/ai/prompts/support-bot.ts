import { RuntimeError } from "@deadlock-mods/common";
import type { MessageContent } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { langfuse } from "@/lib/langfuse";

export const createSupportBotPrompt = (userMention: string) => {
  return ResultAsync.fromPromise(
    langfuse.prompt.get("support-bot"),
    (error) =>
      new RuntimeError("Failed to fetch prompt from Langfuse", {
        cause: error,
      }),
  ).andThen((prompt) => {
    if (!prompt) {
      return errAsync(new RuntimeError("Prompt not found in Langfuse"));
    }

    const compiledPrompt = prompt.compile({ userMention });

    return okAsync({
      metadata: { langfusePrompt: prompt },
      prompt: ChatPromptTemplate.fromMessages([
        ["system", compiledPrompt as MessageContent],
        new MessagesPlaceholder("history"),
        new MessagesPlaceholder("messages"),
      ]),
    });
  });
};
