import { db, ProfileRepository } from "@deadlock-mods/database";
import { profileSchema, toProfileDto } from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { logger } from "@/lib/logger";
import { generateHash } from "@/lib/utils";
import { publicProcedure } from "../../lib/orpc";
import {
  GetProfileInputSchema,
  ShareProfileInputSchema,
  ShareProfileOutputSchema,
} from "../../validation/profiles";

const profileRepository = new ProfileRepository(db);

export const profilesRouter = {
  getProfile: publicProcedure
    .route({ method: "GET", path: "/v2/profiles/{id}" })
    .input(GetProfileInputSchema)
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
    .input(ShareProfileInputSchema)
    .output(ShareProfileOutputSchema)
    .handler(async ({ input }) => {
      try {
        const contentHash = generateHash(JSON.stringify(input));

        logger
          .withMetadata({
            hardwareId: input.hardwareId,
            profileName: input.name,
            version: input.version,
            contentHash,
            modCount: input.profile.payload.mods.length,
          })
          .info("Processing profile share request");

        const existingProfile =
          await profileRepository.findByContentHash(contentHash);

        if (existingProfile) {
          logger
            .withMetadata({
              profileId: existingProfile.id,
              contentHash,
            })
            .info("Returning existing profile with matching content hash");
          return { id: existingProfile.id, status: "success" };
        }

        const profile = await profileRepository.create({
          hardwareId: input.hardwareId,
          name: input.name,
          version: input.version,
          contentHash,
          profile: input.profile,
        });

        logger
          .withMetadata({
            profileId: profile.id,
            contentHash,
            modCount: input.profile.payload.mods.length,
          })
          .info("Created new profile successfully");

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
