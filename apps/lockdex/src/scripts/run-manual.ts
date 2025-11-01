import { db, ModRepository } from "@deadlock-mods/database";
import { logger } from "@/lib/logger";
import { modsQueue } from "@/services/queue";

const modRepository = new ModRepository(db);

const main = async () => {
  logger.info("Queuing all mods for indexing");

  try {
    const mods = await modRepository.findAll();

    logger.info(`Found ${mods.length} mods, queuing for processing`);

    for (const mod of mods) {
      await modsQueue.processMod({
        modId: mod.id,
      });
      logger.info(
        `Queued mod processing job for mod: ${mod.name} (ID: ${mod.id})`,
      );
    }

    logger.info(`Successfully queued ${mods.length} mod processing jobs`);
    process.exit(0);
  } catch (error) {
    logger.withError(error).error("Failed to queue mod jobs");
    process.exit(1);
  }
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Something went wrong");
    process.exit(1);
  });
}
