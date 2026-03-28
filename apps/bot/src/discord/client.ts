import { join } from "node:path";
import { REST } from "@discordjs/rest";
import { SapphireClient } from "@sapphire/framework";
import { GatewayIntentBits } from "discord.js";
import { env } from "@/lib/env";

const srcRoot = join(import.meta.dirname, "..");

export const discordClient = new SapphireClient({
  intents: [
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
  loadMessageCommandListeners: true,
  baseUserDirectory: srcRoot,
});

export const discordRest = new REST({ version: "10" }).setToken(env.BOT_TOKEN);
