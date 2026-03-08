import { openai } from "@ai-sdk/openai";
import { PgVector } from "@mastra/pg";
import { env } from "../../../env";

export const INDEX_NAME = "dmm_docs";
export const EMBEDDING_DIMENSION = 1536;

export const vectorStore = new PgVector({
  id: "dmm-docs-vector",
  connectionString: env.DATABASE_URL,
});

export const embeddingModel = openai.textEmbeddingModel(
  env.EMBEDDING_MODEL.replace(/^openai\//, ""),
);
