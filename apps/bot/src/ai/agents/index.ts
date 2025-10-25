import type { BaseError } from "@deadlock-mods/common";
import type { Logger } from "@deadlock-mods/logging";
import { ChatOpenAI } from "@langchain/openai";
import type { Result } from "neverthrow";
import { logger } from "@/lib/logger";

export abstract class Agent {
  protected logger: Logger;
  protected llm: ChatOpenAI;

  constructor() {
    this.logger = logger.child().withContext({
      service: "AIService",
    });
    this.llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0,
    });
  }

  abstract invoke(
    message: string,
    sessionId: string,
    userId: string,
    tags: string[],
  ): Promise<Result<string, BaseError>>;
}
