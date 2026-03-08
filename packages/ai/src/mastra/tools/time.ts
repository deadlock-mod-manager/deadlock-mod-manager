import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getCurrentTimeTool = createTool({
  id: "get-current-time",
  description:
    "Get the current date and time. Use this to check what time it is now, especially when checking if reminders are overdue or due soon.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    currentTime: z
      .string()
      .describe("Current date and time in ISO 8601 format"),
    timestamp: z.number().describe("Current Unix timestamp in milliseconds"),
    timezone: z.string().describe("Timezone information"),
  }),
  execute: async () => {
    const now = new Date();
    return {
      currentTime: now.toISOString(),
      timestamp: now.getTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
});
