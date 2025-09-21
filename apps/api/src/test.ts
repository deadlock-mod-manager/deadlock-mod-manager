// import type { GameBanana } from "@deadlock-mods/shared";
// import { logger } from "./lib/logger";
// import { providerRegistry } from "./providers";

import { GameBananaRssService } from "./services/gamebanana-rss";

async function main() {
  // logger.info(`Synchronizing mods at ${new Date().toISOString()}`);
  // const provider =
  //   providerRegistry.getProvider<GameBanana.GameBananaSubmission>("gamebanana");
  // await provider.synchronize();

  await GameBananaRssService.getInstance().processRssFeed();
}

main();
