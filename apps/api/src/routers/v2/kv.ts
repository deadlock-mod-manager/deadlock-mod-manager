import { parseKv } from "@deadlock-mods/kv-parser-rs";
import { publicProcedure } from "../../lib/orpc";
import { ParseKvInputSchema } from "../../validation/kv";

export const kvRouter = {
  parseKv: publicProcedure
    .route({ method: "POST", path: "/v2/kv-parse" })
    .input(ParseKvInputSchema)
    .handler(async ({ input }) => {
      try {
        const result = parseKv(input.content);
        return {
          success: true,
          data: result.data,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown parsing error";

        const lineMatch = errorMessage.match(/line (\d+)/);
        const columnMatch = errorMessage.match(/column (\d+)/);

        return {
          success: false,
          error: {
            message: errorMessage,
            line: lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined,
            column: columnMatch
              ? Number.parseInt(columnMatch[1], 10)
              : undefined,
          },
        };
      }
    }),
};
