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
      const syncService = ModSyncService.getInstance();
      const result = await syncService.synchronizeMods({
        skipLock: true,
      });

      wide.merge({ success: result.success, resultMessage: result.message });

      if (result.success) {
        wide.emit("success");
        process.exit(0);
      }

      wide.emit("error");
      process.exit(1);
    } catch (error) {
      wide.emit("error", error);
      process.exit(1);
    }
  });
};

if (import.meta.main) {
  syncMods();
}
