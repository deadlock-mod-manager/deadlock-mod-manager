#!/usr/bin/env bun

/**
 * Script to manually trigger mod synchronization from GameBanana
 *
 * Usage:
 * pnpm --filter api sync-mods
 */

import { logger } from "@/lib/logger";
import { ModSyncService } from "@/services/mod-sync";

const syncMods = async () => {
  try {
    logger.info("Starting manual mod synchronization");

    const syncService = ModSyncService.getInstance();
    const result = await syncService.synchronizeMods({
      skipLock: true,
    });

    if (result.success) {
      logger.info(result.message);
      console.log("\n✅ Success:", result.message);
      process.exit(0);
    }

    logger.error(result.message);
    console.error("\n❌ Failed:", result.message);
    process.exit(1);
  } catch (error) {
    logger.withError(error).error("Failed to synchronize mods");
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
};

if (import.meta.main) {
  syncMods();
}
