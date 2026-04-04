import { openai } from "@ai-sdk/openai";
import { PgVector } from "@mastra/pg";
import type { AiConfig } from "../../../config";

export const KB_INDEX_NAME = "dmm_kb";
export const KB_EMBEDDING_DIMENSION = 1536;

export function createKbVectorDeps(config: AiConfig) {
  const vectorStore = new PgVector({
    id: "dmm-kb-vector",
    connectionString: config.DATABASE_URL,
  });

  const embeddingModel = openai.textEmbeddingModel(
    config.EMBEDDING_MODEL.replace(/^openai\//, ""),
  );

  return {
    vectorStore,
    embeddingModel,
    INDEX_NAME: KB_INDEX_NAME,
    EMBEDDING_DIMENSION: KB_EMBEDDING_DIMENSION,
  };
}

export type KbVectorDeps = ReturnType<typeof createKbVectorDeps>;
