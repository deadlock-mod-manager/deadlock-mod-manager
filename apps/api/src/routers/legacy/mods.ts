import {
  db,
  ModDownloadRepository,
  ModRepository,
} from "@deadlock-mods/database";
import { toModDownloadDto, toModDto } from "@deadlock-mods/shared";
import { Hono } from "hono";
import { CACHE_TTL } from "@/lib/constants";
import { cache } from "@/lib/redis";

const modsRouter = new Hono();
const modRepository = new ModRepository(db);
const modDownloadRepository = new ModDownloadRepository(db);

modsRouter.get("/", async (c) => {
  const result = await cache.wrap(
    "mods:listing",
    async () => {
      const allMods = await modRepository.findAll();
      return allMods.map(toModDto);
    },
    CACHE_TTL.MODS_LISTING,
  );
  return c.json(result);
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
