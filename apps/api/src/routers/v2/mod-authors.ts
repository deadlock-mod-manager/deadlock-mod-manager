import { db, ModAuthorRepository } from "@deadlock-mods/database";
import {
  ModAuthorIdParamSchema,
  ModAuthorResponseSchema,
  toModAuthorDto,
  toModDto,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { publicProcedure } from "../../lib/orpc";

const modAuthorRepository = new ModAuthorRepository(db);

export const modAuthorsRouter = {
  getModAuthorV2: publicProcedure
    .route({ method: "GET", path: "/v2/mod-authors/{id}" })
    .input(ModAuthorIdParamSchema)
    .output(ModAuthorResponseSchema)
    .handler(async ({ input }) => {
      const profile = await modAuthorRepository.findProfileById(input.id);
      if (!profile) {
        throw new ORPCError("NOT_FOUND");
      }
      return {
        author: toModAuthorDto(profile.author),
        mods: profile.mods.map(toModDto),
      };
    }),
};
