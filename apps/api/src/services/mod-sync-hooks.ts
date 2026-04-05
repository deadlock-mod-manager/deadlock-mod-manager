import { db, type Mod, ReportRepository } from "@deadlock-mods/database";
import { REDIS_CHANNELS } from "@deadlock-mods/shared";
import { logger, wideEventContext } from "@/lib/logger";
import { redisPublisher } from "@/lib/redis";

const reportRepository = new ReportRepository(db);

export class ModSyncHooksService {
  private static instance: ModSyncHooksService | null = null;

  private constructor() {}

  static getInstance(): ModSyncHooksService {
    if (!ModSyncHooksService.instance) {
      ModSyncHooksService.instance = new ModSyncHooksService();
    }
    return ModSyncHooksService.instance;
  }

  async onModFilesUpdated(mod: Mod, filesUpdatedAt: Date): Promise<void> {
    const wide = wideEventContext.get();
    wide?.merge({
      hook: "onModFilesUpdated",
      modId: mod.id,
      modName: mod.name,
    });

    try {
      const dismissedCount = await reportRepository.dismissUnverifiedByModId(
        mod.id,
        "system",
        "Mod files updated",
      );
      wide?.set("dismissedReportCount", dismissedCount);
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ modId: mod.id, modName: mod.name })
        .error("Failed to dismiss unverified reports after mod files update");
    }

    try {
      await redisPublisher.publish(
        REDIS_CHANNELS.MOD_FILES_UPDATED,
        JSON.stringify({
          type: "mod_files_updated",
          data: {
            modId: mod.id,
            remoteId: mod.remoteId,
            modName: mod.name,
            filesUpdatedAt: filesUpdatedAt.toISOString(),
          },
        }),
      );
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          modId: mod.id,
          channel: REDIS_CHANNELS.MOD_FILES_UPDATED,
        })
        .error("Failed to publish mod files updated event");
    }
  }
}
