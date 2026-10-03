import { REST } from "@discordjs/rest";
import { SapphireClient } from "@sapphire/framework";
import { getBotIntents } from "../config/ai-support";
import { env } from "./env";

const client = new SapphireClient({
  intents: getBotIntents(env.AI_SUPPORT_ENABLED),
  loadMessageCommandListeners: true,
});

export default client;

export const rest = new REST({ version: "10" }).setToken(env.BOT_TOKEN);
