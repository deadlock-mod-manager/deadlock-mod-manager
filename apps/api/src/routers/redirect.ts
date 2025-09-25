import {
  db,
  ModDownloadRepository,
  ModRepository,
} from "@deadlock-mods/database";
import { Hono } from "hono";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  router: "redirect",
});

const modRepository = new ModRepository(db);
const modDownloadRepository = new ModDownloadRepository(db);

const app = new Hono();

app.get("/mod/:remoteId", async (c) => {
  const remoteId = c.req.param("remoteId");
  if (!remoteId) {
    return c.text("Remote ID is required", 400);
  }

  try {
    logger.withMetadata({ remoteId }).info("Processing mod redirect request");

    const mod = await modRepository.findByRemoteId(remoteId);

    if (!mod) {
      logger.withMetadata({ remoteId }).warn("Mod not found for redirect");
      return c.text("Mod not found", 404);
    }

    const downloads = await modDownloadRepository.findByModId(mod.id);
    const downloadUrl = downloads.length > 0 ? downloads[0].url : null;

    if (!downloadUrl) {
      logger
        .withMetadata({ remoteId, modId: mod.id })
        .warn("No download URL found for mod");
      return c.text("Download not available", 404);
    }

    const modType = mod.isAudio ? "Sound" : "Mod";

    const deepLink = `deadlock-mod-manager:${downloadUrl},${modType},${remoteId}`;

    logger
      .withMetadata({
        remoteId,
        modId: mod.id,
        modType,
        downloadUrl: `${downloadUrl.substring(0, 50)}...`,
      })
      .info("Redirecting to mod manager");

    return c.redirect(deepLink, 301);
  } catch (error) {
    logger
      .withError(error)
      .withMetadata({ remoteId })
      .error("Error processing mod redirect");

    return c.text("Internal server error", 500);
  }
});

export default app;
