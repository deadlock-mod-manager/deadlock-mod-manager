import type { BaseError } from "@deadlock-mods/common";
import type { Logger } from "@deadlock-mods/logging";
import { ChatOpenAI } from "@langchain/openai";
import type { ResultAsync } from "neverthrow";
import { logger } from "@/lib/logger";

export interface AgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number | undefined;
  maxRetries?: number;
  streaming?: boolean;
}

export abstract class Agent {
  protected logger: Logger;
  protected llm: ChatOpenAI;
  protected config: AgentConfig;

  constructor(config: AgentConfig = {}) {
    this.config = {
      model: config.model ?? "gpt-4o-mini",
      temperature: config.temperature ?? 0,
      maxTokens: config.maxTokens ?? undefined,
      maxRetries: config.maxRetries ?? 3,
      streaming: config.streaming ?? false,
    };

    this.logger = logger.child().withContext({
      service: this.constructor.name,
    });

    this.llm = new ChatOpenAI({
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      streaming: this.config.streaming,
    });

    this.logger
      .withMetadata({
        model: this.config.model,
        temperature: this.config.temperature,
        maxRetries: this.config.maxRetries,
      })
      .debug("Agent initialized");
  }

  abstract invoke(
    message: string,
    sessionId: string,
    userId: string,
    tags: string[],
    channelId: string,
    userMention: string,
  ): ResultAsync<string, BaseError>;
}
