import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";
import { PromptInjectionDetector } from "@mastra/core/processors";
import { Memory } from "@mastra/memory";
import type { MCPClient } from "@mastra/mcp";
import { PostgresStore } from "@mastra/pg";
import type { AiConfig } from "../../config";
import { createDiscordMcp } from "../mcp/discord";
import { SOUL_INSTRUCTIONS } from "../memory/soul";
import { createSearchDocsTool } from "../tools/docs";
import { createDocsVectorDeps } from "../tools/docs/vector-store";
import { createSearchKbTool } from "../tools/kb";
import { createKbVectorDeps } from "../tools/kb/vector-store";
import { readSoulTool, updateSoulTool } from "../tools/soul";
import { createWebFetchTool, createWebSearchTool } from "../tools/web";

export type SmotixRuntimeContext = {
  "dynamic-tools"?: ToolsInput;
};

export async function createDmmAgent(config: AiConfig): Promise<{
  agent: Agent;
  mcpClients: MCPClient[];
}> {
  const discordMcp = createDiscordMcp(config);
  const discordTools = await discordMcp.listTools();
  const mcpClients: MCPClient[] = [discordMcp];

  const docsDeps = createDocsVectorDeps(config);
  const searchDocsTool = createSearchDocsTool(docsDeps);

  const kbDeps = createKbVectorDeps(config);
  const searchKbTool = createSearchKbTool(kbDeps);

  const perplexitySearchTool = createWebSearchTool({
    provider: "perplexity",
    perplexity: { apiKey: config.OPENROUTER_API_KEY },
  });
  const braveSearchTool = createWebSearchTool({
    provider: "brave",
    braveApiKey: config.BRAVE_API_KEY,
  });
  const webFetchTool = createWebFetchTool();

  const agent = new Agent({
    id: "dmm",
    name: "Deadlock Mod Manager Helper",
    instructions: SOUL_INSTRUCTIONS,
    model: config.DEFAULT_MODEL,
    tools: ({ requestContext }) => {
      const dynamicTools = (requestContext?.get("dynamic-tools") ??
        {}) as ToolsInput;
      return {
        searchDocsTool,
        searchKbTool,
        readSoulTool,
        updateSoulTool,
        perplexitySearchTool,
        braveSearchTool,
        webFetchTool,
        ...discordTools,
        ...dynamicTools,
      };
    },
    memory: new Memory({
      storage: new PostgresStore({
        id: "dmm-agent-storage",
        connectionString: config.DATABASE_URL,
      }),
      options: {
        lastMessages: 30,
      },
    }),
    inputProcessors: [
      new PromptInjectionDetector({
        model: config.GUARDRAILS_MODEL,
        threshold: 0.85,
        strategy: "rewrite",
        detectionTypes: ["injection", "jailbreak", "system-override"],
      }),
    ],
  });

  return { agent, mcpClients };
}
