import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const soulPath = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "memory",
  "soul.md",
);

export const readSoulTool = createTool({
  id: "read-soul",
  description:
    "Read your current soul file - your identity and personality guidelines",
  inputSchema: z.object({}),
  outputSchema: z.object({
    content: z.string().describe("The current soul file content"),
  }),
  execute: async () => {
    const content = readFileSync(soulPath, "utf-8");
    return {
      content,
    };
  },
});

export const updateSoulTool = createTool({
  id: "update-soul",
  description:
    "Update your soul file - your identity and personality. Use this when you learn something new about who you are or want to evolve your personality. Always explain why you're making the change.",
  inputSchema: z.object({
    content: z
      .string()
      .min(100, "Soul content must be at least 100 characters")
      .describe("The new soul file content in markdown format"),
    reason: z
      .string()
      .min(20, "Reason must be at least 20 characters")
      .describe(
        "Explain why you're updating your soul - what did you learn or what changed?",
      ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ content, reason }) => {
    if (!content || content.trim().length < 100) {
      return {
        success: false,
        message: "Soul content must be at least 100 characters",
      };
    }

    try {
      writeFileSync(soulPath, content, "utf-8");
      return {
        success: true,
        message: `Soul updated successfully. Reason: ${reason}. Note: Changes will take effect after the agent restarts.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update soul: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
