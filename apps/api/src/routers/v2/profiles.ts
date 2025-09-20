import { db, ProfileRepository } from "@deadlock-mods/database";
import { profileSchema, toProfileDto } from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { generateHash } from "@/lib/utils";
import { publicProcedure } from "../../lib/orpc";

const profileRepository = new ProfileRepository(db);

export const profilesRouter = {
  getProfile: publicProcedure
    .route({ method: "GET", path: "/v2/profiles/{id}" })
    .input(z.object({ id: z.string() }))
    .output(profileSchema)
    .handler(async ({ input }) => {
      const profile = await profileRepository.findById(input.id);
      if (!profile) {
        throw new ORPCError("NOT_FOUND");
      }
      return toProfileDto(profile);
    }),
  shareProfile: publicProcedure
    .route({ method: "POST", path: "/v2/profiles" })
    .input(
      z.object({
        hardwareId: z.string(),
        name: z.string(),
        version: z.string(),
        profile: profileSchema,
      }),
    )
    .output(
      z.object({
        id: z.string().nullable(),
        status: z.enum(["success", "error"]),
        error: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      try {
        const contentHash = generateHash(JSON.stringify(input));

        const existingProfile =
          await profileRepository.findByContentHash(contentHash);

        if (existingProfile) {
          return { id: existingProfile.id, status: "success" };
        }

        const profile = await profileRepository.create({
          hardwareId: input.hardwareId,
          name: input.name,
          version: input.version,
          contentHash,
          profile: input.profile,
        });
        return { id: profile.id, status: "success" };
      } catch (error) {
        return {
          id: null,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
};
