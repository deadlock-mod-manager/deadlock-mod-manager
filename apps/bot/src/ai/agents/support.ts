import { RuntimeError } from "@deadlock-mods/common";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { ChatPromptTemplate } from "@langchain/core/prompts";
import { ConsoleCallbackHandler } from "@langchain/core/tracers/console";
import { CallbackHandler } from "@langfuse/langchain";
import { createAgent } from "langchain";
import { err, ok } from "neverthrow";
import { DrizzleChatMessageHistory } from "@/lib/chat-history";
import { env } from "@/lib/env";
import { DocumentationRetriever } from "@/services/documentation-retriever";
import { createSupportBotPrompt } from "../prompts/support-bot";
import { createDocumentationSearchTool } from "../tools/search-documentation";
import { Agent, type AgentConfig } from ".";

export class SupportAgent extends Agent {
  private promptCache: Map<string, ChatPromptTemplate> = new Map();
  private documentationRetriever: DocumentationRetriever;

  constructor(config?: AgentConfig) {
    super(config);
    this.documentationRetriever = new DocumentationRetriever();
  }

  private async getPrompt(userMention: string) {
    if (this.promptCache.has(userMention)) {
      return ok(this.promptCache.get(userMention)!);
    }

    const promptResult = await createSupportBotPrompt(userMention);
    if (promptResult.isErr()) {
      return promptResult;
    }

    this.promptCache.set(userMention, promptResult.value);
    return ok(promptResult.value);
  }

  async invoke(
    message: string,
    sessionId: string,
    userId: string,
    tags: string[],
    channelId: string,
    userMention: string,
  ) {
    this.logger
      .withMetadata({ sessionId, userId, tags, channelId, userMention })
      .info("Invoking support agent");

    const promptResult = await this.getPrompt(userMention);
    if (promptResult.isErr()) {
      return err(promptResult.error);
    }

    const prompt = promptResult.value;

    const langfuseCallback = new CallbackHandler({
      sessionId,
      userId,
      tags,
    });

    const documentationTool = createDocumentationSearchTool(
      this.documentationRetriever,
    );

    const tools = [documentationTool];

    const chatHistory = new DrizzleChatMessageHistory(userId, channelId);
    const historyMessages = await chatHistory.getMessages();

    const agent = createAgent({
      model: this.llm.withConfig({
        callbacks: [
          langfuseCallback,
          ...(env.DEBUG ? [new ConsoleCallbackHandler()] : []),
        ],
      }),
      tools,
    });

    try {
      const response = await agent.invoke(
        {
          messages: await prompt.formatMessages({
            history: historyMessages,
            messages: [{ type: "human", content: message }],
          }),
        },
        {
          recursionLimit: this.config.maxRetries
            ? this.config.maxRetries * 2 + 1
            : undefined,
          configurable: {
            sessionId,
          },
        },
      );

      const messages = response.messages;
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage) {
        return err(new RuntimeError("No response from agent"));
      }

      const output =
        lastMessage instanceof AIMessage ? lastMessage.content : "";
      const outputString =
        typeof output === "string" ? output : JSON.stringify(output);

      await chatHistory.addMessage(new HumanMessage(message));
      await chatHistory.addMessage(new AIMessage(outputString));

      this.logger
        .withMetadata({
          sessionId,
          userId,
          responseLength: outputString.length,
        })
        .info("Support agent invocation successful");

      return ok(outputString);
    } catch (error) {
      this.logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .withMetadata({ sessionId, userId })
        .error("LLM invocation failed");

      return err(
        new RuntimeError("Failed to invoke support agent", {
          cause: error,
        }),
      );
    }
  }
}

export const supportAgent = new SupportAgent();
