import { RuntimeError } from "@deadlock-mods/common";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { langfuse } from "@/lib/langfuse";

export const createSupportBotPrompt = () => {
  return ResultAsync.fromPromise(
    langfuse.prompt.get("support-bot", {}),
    (error) =>
      new RuntimeError("Failed to fetch prompt from Langfuse", {
        cause: error,
      }),
  ).andThen((prompt) => {
    if (!prompt) {
      return errAsync(new RuntimeError("Prompt not found in Langfuse"));
    }

    return okAsync({
      metadata: { langfusePrompt: prompt },
      prompt: ChatPromptTemplate.fromMessages([
        ["system", prompt.compile()],
        new MessagesPlaceholder("messages"),
      ]),
    });
  });
};
