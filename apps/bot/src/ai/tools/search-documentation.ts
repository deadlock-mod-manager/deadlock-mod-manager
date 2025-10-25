import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { DocumentationRetriever } from "@/services/documentation-retriever";

const searchDocumentationSchema = z.object({
  query: z
    .string()
    .describe(
      "The search query to find relevant information in the documentation",
    ),
  numResults: z
    .number()
    .min(1)
    .max(10)
    .default(4)
    .describe("Number of relevant chunks to retrieve (default: 4)"),
});

export function createDocumentationSearchTool(
  retriever: DocumentationRetriever,
) {
  return new DynamicStructuredTool({
    name: "search_documentation",
    description:
      "Search the Deadlock Mod Manager documentation to find relevant information about features, troubleshooting, API usage, or common issues. Use this when users ask questions about how to use the mod manager, encounter errors, or need technical information.",
    schema: searchDocumentationSchema,
    func: async ({ query, numResults }) => {
      const result = await retriever.retrieve(query, numResults);

      return result.match(
        (chunks) => {
          if (chunks.length === 0) {
            return "No relevant documentation found for the query.";
          }

          const formattedChunks = chunks
            .map(
              (chunk, index) =>
                `[Result ${index + 1}] (Similarity: ${chunk.similarity.toFixed(2)})\n${chunk.content}`,
            )
            .join("\n\n---\n\n");

          return `Found ${chunks.length} relevant documentation sections:\n\n${formattedChunks}`;
        },
        (error) => {
          return `Error searching documentation: ${error.message}. Please try rephrasing your query or provide a general answer based on your knowledge.`;
        },
      );
    },
  });
}
