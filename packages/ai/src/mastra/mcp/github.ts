import { MCPClient } from "@mastra/mcp";
import { env } from "../../env";

export const githubMcp = new MCPClient({
  id: "github-mcp",
  servers: {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: env.GITHUB_PERSONAL_ACCESS_TOKEN,
      },
    },
  },
});
