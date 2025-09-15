import { REST } from '@discordjs/rest';
import { SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits } from 'discord.js';
import { env } from './env';

const client = new SapphireClient({
  intents: [
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  loadMessageCommandListeners: true,
});

export default client;

export const rest = new REST({ version: '10' }).setToken(env.BOT_TOKEN);
