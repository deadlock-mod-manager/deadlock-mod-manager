import {
  db,
  ModDownloadRepository,
  ModRepository,
} from "@deadlock-mods/database";
import { Hono } from "hono";
import { wideEventContext } from "@/lib/logger";

const modRepository = new ModRepository(db);
const modDownloadRepository = new ModDownloadRepository(db);

const app = new Hono();

app.get("/mod/:remoteId", async (c) => {
  const remoteId = c.req.param("remoteId");
  if (!remoteId) {
    return c.text("Remote ID is required", 400);
  }

  const wide = wideEventContext.get();
  wide?.merge({ router: "redirect", remoteId });

  try {
    const mod = await modRepository.findByRemoteId(remoteId);

    if (!mod) {
      wide?.set("outcomeReason", "mod_not_found");
      return c.text("Mod not found", 404);
    }

    const downloads = await modDownloadRepository.findByModId(mod.id);
    const downloadUrl = downloads.length > 0 ? downloads[0].url : null;

    if (!downloadUrl) {
      wide?.merge({ modId: mod.id, outcomeReason: "no_download_url" });
      return c.text("Download not available", 404);
    }

    const modType = mod.isAudio ? "Sound" : "Mod";
    const deepLink = `deadlock-mod-manager:${downloadUrl},${modType},${remoteId}`;

    wide?.merge({ modId: mod.id, modType });

    return c.redirect(deepLink, 301);
  } catch (error) {
    wide?.set("outcomeReason", "internal_error");
    wide?.emit("error", error);
    return c.text("Internal server error", 500);
  }
});

export default app;
