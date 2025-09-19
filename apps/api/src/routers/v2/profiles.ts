import { db, ProfileRepository } from "@deadlock-mods/database";
import { profileSchema } from "@deadlock-mods/shared";
import { z } from "zod";
import { generateHash } from "@/lib/utils";
import { publicProcedure } from "../../lib/orpc";

const profileRepository = new ProfileRepository(db);

export const profilesRouter = {
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
