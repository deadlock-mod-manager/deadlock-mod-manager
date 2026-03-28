import type { SapphireClient } from "@sapphire/framework";
import { env } from "@/lib/env";

export class BotStartupService {
  async initialize(client: SapphireClient): Promise<void> {
    await client.login(env.BOT_TOKEN);
  }
}
