import { mapDrizzleError, RuntimeError } from "@deadlock-mods/common";
import { db, documentationChunks, sql } from "@deadlock-mods/database";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ResultAsync } from "neverthrow";
import { logger } from "@/lib/logger";

export interface RetrievedChunk {
  id: string;
  content: string;
  similarity: number;
  metadata: {
    chunkIndex: number;
    startChar: number;
    endChar: number;
  } | null;
}

export class DocumentationRetriever {
  private embeddings: OpenAIEmbeddings;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });
  }

  async retrieve(query: string, k = 4) {
    logger
      .withMetadata({ query, k })
      .info("Retrieving relevant documentation chunks");

    return ResultAsync.fromPromise(
      this.embeddings.embedQuery(query),
      (error) => new RuntimeError("Failed to generate query embedding", error),
    ).andThen((queryEmbedding) =>
      ResultAsync.fromPromise(
        db
          .select({
            id: documentationChunks.id,
            content: documentationChunks.content,
            metadata: documentationChunks.metadata,
            similarity: sql<number>`1 - (${documentationChunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`,
          })
          .from(documentationChunks)
          .orderBy(
            sql`${documentationChunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`,
          )
          .limit(k)
          .then((results) =>
            results.map((result) => ({
              id: result.id,
              content: result.content,
              similarity: result.similarity,
              metadata: result.metadata as {
                chunkIndex: number;
                startChar: number;
                endChar: number;
              } | null,
            })),
          ),
        (error) => {
          logger
            .withError(error)
            .error("Failed to retrieve documentation chunks");
          return mapDrizzleError(error);
        },
      ).map((results) => {
        logger
          .withMetadata({
            query,
            resultsCount: results.length,
            topSimilarity: results[0]?.similarity,
          })
          .info("Retrieved documentation chunks");
        return results;
      }),
    );
  }
}
