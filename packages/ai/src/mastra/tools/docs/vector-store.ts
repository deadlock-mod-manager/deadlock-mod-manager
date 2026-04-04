import { openai } from "@ai-sdk/openai";
import { PgVector } from "@mastra/pg";
import type { AiConfig } from "../../../config";

export const INDEX_NAME = "dmm_docs";
export const EMBEDDING_DIMENSION = 1536;

export function createDocsVectorDeps(config: AiConfig) {
  const vectorStore = new PgVector({
    id: "dmm-docs-vector",
    connectionString: config.DATABASE_URL,
  });

  const embeddingModel = openai.textEmbeddingModel(
    config.EMBEDDING_MODEL.replace(/^openai\//, ""),
  );

  return {
    vectorStore,
    embeddingModel,
    INDEX_NAME,
    EMBEDDING_DIMENSION,
  };
}

export type DocsVectorDeps = ReturnType<typeof createDocsVectorDeps>;
