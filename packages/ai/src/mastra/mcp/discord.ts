import { MCPClient } from "@mastra/mcp";
import { env } from "../../env";

export const discordMcp = new MCPClient({
  id: "discord-mcp",
  servers: {
    discord: {
      command: "npx",
      args: ["-y", "mcp-discord"],
      env: {
        DISCORD_TOKEN: env.DISCORD_TOKEN,
      },
    },
  },
});
