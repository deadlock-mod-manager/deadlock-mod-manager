import { RuntimeError } from "@deadlock-mods/common";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { err, ok } from "neverthrow";
import { langfuse } from "@/lib/langfuse";

export const createSupportBotPrompt = async () => {
  const prompt = await langfuse.prompt.get("support-bot", {});
  if (!prompt) {
    return err(new RuntimeError("Prompt not found"));
  }

  return ok(
    ChatPromptTemplate.fromMessages([
      ["system", prompt.compile()],
      new MessagesPlaceholder("messages"),
    ]).withConfig({
      metadata: { langfusePrompt: prompt },
    }),
  );
};
