import {
  db,
  ModDownloadRepository,
  ModRepository,
} from "@deadlock-mods/database";
import {
  ModDownloadsResponseSchema,
  ModIdParamSchema,
  ModSchema,
  ModsListResponseSchema,
  toModDownloadDto,
  toModDto,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { publicProcedure } from "../../lib/orpc";

const modRepository = new ModRepository(db);
const modDownloadRepository = new ModDownloadRepository(db);

export const v1Router = {
  listModsV1: publicProcedure
    .route({ method: "GET", path: "/v1/mods" })
    .output(ModsListResponseSchema)
    .handler(async () => {
      const allMods = await modRepository.findAll();
      return allMods.map(toModDto);
    }),

  getModV1: publicProcedure
    .route({ method: "GET", path: "/v1/mods/{id}" })
    .input(ModIdParamSchema)
    .output(ModSchema)
    .handler(async ({ input }) => {
      const mod = await modRepository.findByRemoteId(input.id);
      if (!mod) {
        throw new ORPCError("NOT_FOUND");
      }
      return toModDto(mod);
    }),

  getModDownloadV1: publicProcedure
    .route({ method: "GET", path: "/v1/mods/{id}/download" })
    .input(ModIdParamSchema)
    .output(ModDownloadsResponseSchema)
    .handler(async ({ input }) => {
      const mod = await modRepository.findByRemoteId(input.id);
      if (!mod) {
        throw new ORPCError("NOT_FOUND");
      }

      const downloads = await modDownloadRepository.findByModId(mod.id);
      if (downloads.length === 0) {
        throw new ORPCError("NOT_FOUND");
      }

      // V1: Return only the first download (primary/largest file)
      const sortedDownloads = downloads.sort((a, b) => b.size - a.size);
      const primaryDownload = [sortedDownloads[0]];
      return toModDownloadDto(primaryDownload);
    }),
};
