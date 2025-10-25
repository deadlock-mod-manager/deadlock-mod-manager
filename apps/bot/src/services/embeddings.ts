import type { Logger } from "@deadlock-mods/logging";
import { OpenAIEmbeddings } from "@langchain/openai";
import { logger } from "@/lib/logger";

export class EmbeddingsService {
  static #instance: EmbeddingsService | null = null;
  private logger: Logger;
  private embeddings: OpenAIEmbeddings;

  private constructor() {
    this.logger = logger.child().withContext({
      service: "EmbeddingsService",
    });
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-large",
    });
  }

  static get instance(): EmbeddingsService {
    if (!EmbeddingsService.#instance) {
      EmbeddingsService.#instance = new EmbeddingsService();
    }
    return EmbeddingsService.#instance;
  }
}
