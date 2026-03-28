import { createTool } from "@mastra/core/tools";
import { embed } from "ai";
import { z } from "zod";
import type { DocsVectorDeps } from "./vector-store";

export function createSearchDocsTool(deps: DocsVectorDeps) {
  const { vectorStore, embeddingModel, INDEX_NAME } = deps;

  return createTool({
    id: "search-docs",
    description:
      "Search Deadlock Mod Manager documentation by semantic similarity. Use when answering questions about installation, features, API, plugins, modding, or developer docs. Returns the most relevant doc chunks.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Natural language search query about the docs"),
      topK: z
        .number()
        .min(1)
        .max(15)
        .optional()
        .default(5)
        .describe("Number of relevant chunks to return (default 5)"),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          text: z.string(),
          title: z.string(),
          slug: z.string(),
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
        title:
          typeof r.metadata?.title === "string" ? r.metadata.title : "Untitled",
        slug: typeof r.metadata?.slug === "string" ? r.metadata.slug : "",
        score: r.score,
      }));

      return { results };
    },
  });
}

export { ingestDocs } from "./ingest";
