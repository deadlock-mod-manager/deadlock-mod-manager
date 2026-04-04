import { MCPClient } from "@mastra/mcp";
import type { AiConfig } from "../../config";

export function createDiscordMcp(config: AiConfig) {
  return new MCPClient({
    id: "discord-mcp",
    servers: {
      discord: {
        command: "npx",
        args: ["-y", "mcp-discord"],
        env: {
          DISCORD_TOKEN: config.BOT_TOKEN,
        },
      },
    },
  });
}
