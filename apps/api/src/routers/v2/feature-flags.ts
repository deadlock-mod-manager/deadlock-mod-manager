import { z } from "zod";
import { logger } from "@/lib/logger";
import { publicProcedure } from "../../lib/orpc";
import { featureFlagsService } from "../../services/feature-flags";

const FeatureFlagSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
});

const FeatureFlagsResponseSchema = z.array(FeatureFlagSchema);

export const featureFlagsRouter = {
  getFeatureFlags: publicProcedure
    .route({ method: "GET", path: "/v2/feature-flags" })
    .output(FeatureFlagsResponseSchema)
    .handler(async () => {
      try {
        const allFlagsResult = await featureFlagsService.getAllFeatureFlags();

        if (allFlagsResult.isErr()) {
          logger
            .withError(allFlagsResult.error)
            .error("Failed to retrieve feature flags from database");
          return [];
        }

        const featureFlags = allFlagsResult.value.map((flag) => ({
          name: flag.name,
          enabled: flag.value,
        }));

        logger
          .withMetadata({
            featureFlagsCount: featureFlags.length,
            featureFlags: featureFlags.map((f) => ({
              name: f.name,
              enabled: f.enabled,
            })),
          })
          .info("Retrieved all feature flags for client");

        return featureFlags;
      } catch (error) {
        logger
          .withError(error)
          .error("Failed to retrieve feature flags, returning empty array");

        // Return empty array if there's an error
        return [];
      }
    }),
};
