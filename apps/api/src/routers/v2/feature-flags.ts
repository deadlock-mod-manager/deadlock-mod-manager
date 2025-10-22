import { z } from "zod";
import { logger } from "@/lib/logger";
import { publicProcedure } from "../../lib/orpc";
import { featureFlagsService } from "../../services/feature-flags";

const FeatureFlagSchema = z.object({
  name: z.string(),
  enabled: z.unknown(),
});

const FeatureFlagsResponseSchema = z.array(FeatureFlagSchema);

export const featureFlagsRouter = {
  getFeatureFlags: publicProcedure
    .route({ method: "GET", path: "/v2/feature-flags" })
    .output(FeatureFlagsResponseSchema)
    .handler(async ({ context }) => {
      const userId = context.session?.user?.id;

      const allFlagsResult = await featureFlagsService.getAllFeatureFlags();

      if (allFlagsResult.isErr()) {
        logger
          .withError(allFlagsResult.error)
          .error("Failed to retrieve feature flags from database");
        return [];
      }

      const featureFlagResults = await Promise.all(
        allFlagsResult.value.map(async (flag) => {
          const valueResult = await featureFlagsService.getFeatureFlagValue(
            flag.name,
            userId,
            false,
          );

          return {
            name: flag.name,
            enabled: valueResult.unwrapOr(flag.value),
          };
        }),
      );

      logger
        .withMetadata({
          featureFlagsCount: featureFlagResults.length,
          userId: userId ?? "unauthenticated",
          featureFlags: featureFlagResults,
        })
        .info("Retrieved all feature flags for client");

      return featureFlagResults;
    }),
};
