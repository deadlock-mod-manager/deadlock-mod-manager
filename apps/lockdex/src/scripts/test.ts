import { db, ModRepository } from "@deadlock-mods/database";
import { logger } from "@/lib/logger";
import { modsQueue } from "@/services/queue";

const modRepository = new ModRepository(db);

const main = async () => {
  logger.info("Test script - Queuing mod jobs for first 10 mods");

  try {
    // Get the first 10 mods from the database
    const mods = await modRepository.findAll();

    logger.info(
      `Found ${mods.length} total mods, queuing jobs for first ${mods.length} mods`,
    );

    // Queue mod processing jobs for each of the first 10 mods
    for (const mod of mods) {
      await modsQueue.processMod({
        modId: mod.id,
      });
      logger.info(
        `Queued mod processing job for mod: ${mod.name} (ID: ${mod.id})`,
      );
    }

    logger.info(`Successfully queued ${mods.length} mod processing jobs`);
  } catch (error) {
    logger.withError(error).error("Failed to queue mod jobs");
  }
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Something went wrong");
    process.exit(1);
  });
}
