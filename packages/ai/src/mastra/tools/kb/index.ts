import { createTool } from "@mastra/core/tools";
import { embed } from "ai";
import { z } from "zod";
import type { KbVectorDeps } from "./vector-store";

export function createSearchKbTool(deps: KbVectorDeps) {
  const { vectorStore, embeddingModel, INDEX_NAME } = deps;

  return createTool({
    id: "search-kb",
    description:
      "Search the community knowledge base for known issues, workarounds, and community-reported fixes. Use alongside search-docs when answering support questions, especially for recent errors or problems not yet covered in official documentation.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Natural language search query about known issues or workarounds",
        ),
      topK: z
        .number()
        .min(1)
        .max(15)
        .optional()
        .default(5)
        .describe("Number of relevant entries to return (default 5)"),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          text: z.string(),
          messageId: z.string(),
          authorId: z.string(),
          score: z.number(),
        }),
      ),
    }),
    execute: async ({ query, topK }) => {
      const { embedding } = await embed({
        model: embeddingModel,
        value: query,
      });

      const indexExists = (await vectorStore.listIndexes()).includes(
        INDEX_NAME,
      );
      if (!indexExists) {
        return { results: [] };
      }

      const rawResults = await vectorStore.query({
        indexName: INDEX_NAME,
        queryVector: embedding,
        topK,
      });

      const results = rawResults.map((r) => ({
        text: typeof r.metadata?.text === "string" ? r.metadata.text : "",
        messageId:
          typeof r.metadata?.messageId === "string" ? r.metadata.messageId : "",
        authorId:
          typeof r.metadata?.authorId === "string" ? r.metadata.authorId : "",
        score: r.score,
      }));

      return { results };
    },
  });
}

export { ingestKbMessage } from "./ingest";
