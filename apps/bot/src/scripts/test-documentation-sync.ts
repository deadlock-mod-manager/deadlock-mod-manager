import { logger } from "@/lib/logger";
import { DocumentationSyncService } from "@/services/documentation-sync";

const main = async () => {
  logger.info("Starting manual documentation sync test");

  const syncService = new DocumentationSyncService();

  try {
    const syncResult = await syncService.sync();

    if (syncResult.skipped) {
      logger.info(syncResult.message);
    } else {
      logger
        .withMetadata({
          chunksProcessed: syncResult.chunksProcessed,
          contentHash: syncResult.contentHash,
        })
        .info(syncResult.message);
    }

    process.exit(0);
  } catch (error) {
    logger.withError(error).error("Documentation sync failed");
    process.exit(1);
  }
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error running documentation sync test");
    process.exit(1);
  });
}
