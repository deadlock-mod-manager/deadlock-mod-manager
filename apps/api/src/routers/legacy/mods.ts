import { modDownloadRepository, modRepository } from "@deadlock-mods/database";
import { toModDownloadDto, toModDto } from "@deadlock-mods/utils";
import { Hono } from "hono";

const modsRouter = new Hono();

modsRouter.get("/", async (c) => {
  const allMods = await modRepository.findAll();
  return c.json(allMods.map(toModDto));
});

modsRouter.get("/:id", async (c) => {
  const mod = await modRepository.findByRemoteId(c.req.param("id"));
  if (!mod) {
    return c.json({ error: "Mod not found" }, 404);
  }
  return c.json(toModDto(mod));
});

modsRouter.get("/:id/download", async (c) => {
  const remoteId = c.req.param("id");
  const mod = await modRepository.findByRemoteId(remoteId);

  if (!mod) {
    return c.json({ error: "Mod not found" }, 404);
  }

  const downloads = await modDownloadRepository.findByModId(mod.id);
  return c.json(toModDownloadDto(downloads));
});

export default modsRouter;
