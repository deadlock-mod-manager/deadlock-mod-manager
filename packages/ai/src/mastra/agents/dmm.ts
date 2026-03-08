import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";
import { PromptInjectionDetector } from "@mastra/core/processors";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { SOUL_INSTRUCTIONS } from "../memory/soul";
import { searchDocsTool } from "../tools/docs";
import { readSoulTool, updateSoulTool } from "../tools/soul";
import { createWebSearchTool, createWebFetchTool } from "../tools/web";
import { smotixWorkspace } from "../workspace";
import { githubMcp } from "../mcp/github";
import { discordMcp } from "../mcp/discord";
import { env } from "../../env";

const githubTools = await githubMcp.listTools();
const discordTools = await discordMcp.listTools();

const perplexitySearchTool = createWebSearchTool({ provider: "perplexity" });
const braveSearchTool = createWebSearchTool({ provider: "brave" });
const webFetchTool = createWebFetchTool();

export type SmotixRuntimeContext = {
  "dynamic-tools"?: ToolsInput;
};

export const dmmAgent = new Agent({
  id: "dmm",
  name: "Deadlock Mod Manager Helper",
  instructions: SOUL_INSTRUCTIONS,
  model: env.DEFAULT_MODEL,
  tools: ({ requestContext }) => {
    const dynamicTools = (requestContext?.get("dynamic-tools") ??
      {}) as ToolsInput;
    return {
      searchDocsTool,
      readSoulTool,
      updateSoulTool,
      perplexitySearchTool,
      braveSearchTool,
      webFetchTool,
      ...githubTools,
      ...discordTools,
      ...dynamicTools,
    };
  },
  memory: new Memory({
    storage: new PostgresStore({
      id: "dmm-agent-storage",
      connectionString: env.DATABASE_URL,
    }),
    options: {
      lastMessages: 30,
    },
  }),
  inputProcessors: [
    new PromptInjectionDetector({
      model: env.GUARDRAILS_MODEL as string,
      threshold: 0.8,
      strategy: "rewrite",
      detectionTypes: ["injection", "jailbreak", "system-override"],
    }),
  ],
  workspace: smotixWorkspace,
});
