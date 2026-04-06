#!/usr/bin/env bun

/**
 * Script to manually trigger mod synchronization from GameBanana
 *
 * Usage:
 * pnpm --filter api sync-mods
 */

import { createWideEvent, logger, wideEventContext } from "@/lib/logger";
import { ModSyncService } from "@/services/mod-sync";

const syncMods = async () => {
  const wide = createWideEvent(logger, "manual_mod_sync", {
    trigger: "cli",
  });

  return wideEventContext.run(wide, async () => {
    try {
      logger.info("Starting manual mod synchronization");

      const syncService = ModSyncService.getInstance();
      const result = await syncService.synchronizeMods({
        skipLock: true,
      });

      wide.merge({ success: result.success, resultMessage: result.message });

      if (result.success) {
        logger.info(result.message);
        wide.emit("success");
        process.exit(0);
      }

      logger.error(result.message);
      wide.emit("error");
      process.exit(1);
    } catch (error) {
      logger.withError(error).error("Failed to synchronize mods");
      wide.emit("error", error);
      process.exit(1);
    }
  });
};

if (import.meta.main) {
  syncMods();
}
