import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MessageContent } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { ok, type Result } from "neverthrow";

export const SUPPORT_BOT_PROMPT_NAME = "support-bot";

let cachedPromptTemplate: string | null = null;

async function loadPromptTemplate(): Promise<string> {
  if (cachedPromptTemplate) {
    return cachedPromptTemplate;
  }

  const promptPath = join(__dirname, "support-bot.md");
  cachedPromptTemplate = await readFile(promptPath, "utf-8");
  return cachedPromptTemplate;
}

export const createSupportBotPrompt = async (
  userMention: string,
): Promise<Result<ChatPromptTemplate, never>> => {
  const template = await loadPromptTemplate();
  const compiledPrompt = template.replace("{{userMention}}", userMention);

  return ok(
    ChatPromptTemplate.fromMessages([
      ["system", compiledPrompt as MessageContent],
      new MessagesPlaceholder("history"),
      new MessagesPlaceholder("messages"),
    ]),
  );
};
