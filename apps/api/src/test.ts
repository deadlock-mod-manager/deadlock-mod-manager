import type { GameBanana } from "@deadlock-mods/utils";
import { logger } from "./lib/logger";
import { providerRegistry } from "./lib/providers";

async function main() {
  logger.info(`Synchronizing mods at ${new Date().toISOString()}`);
  const provider =
    providerRegistry.getProvider<GameBanana.GameBananaSubmission>("gamebanana");
  await provider.synchronize();
}

main();
