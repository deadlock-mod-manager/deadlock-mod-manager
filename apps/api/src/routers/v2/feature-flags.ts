import {
  FeatureFlagsResponseSchema,
  FlagIdParamSchema,
  SetUserOverrideInputSchema,
} from "@deadlock-mods/shared";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { protectedProcedure, publicProcedure } from "../../lib/orpc";
import { featureFlagsService } from "../../services/feature-flags";

export const featureFlagsRouter = {
  getFeatureFlags: publicProcedure
    .route({ method: "GET", path: "/v2/feature-flags" })
    .output(FeatureFlagsResponseSchema)
    .handler(async ({ context }) => {
      const userId = context.session?.user?.id;

      const clientFlagsResult = await featureFlagsService.getClientFeatureFlags(
        { userId },
      );

      if (clientFlagsResult.isErr()) {
        logger
          .withError(clientFlagsResult.error)
          .error("Failed to retrieve feature flags");
        return [];
      }

      logger
        .withMetadata({
          featureFlagsCount: clientFlagsResult.value.length,
          userId: userId ?? "unauthenticated",
        })
        .info("Retrieved feature flags for client");

      return clientFlagsResult.value;
    }),

  setUserOverride: protectedProcedure
    .route({
      method: "PUT",
      path: "/v2/feature-flags/{flagId}/user-override",
    })
    .input(
      z.object({
        ...FlagIdParamSchema.shape,
        ...SetUserOverrideInputSchema.shape,
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      const { flagId, value } = input;

      const result = await featureFlagsService.setUserOverride(
        userId,
        flagId,
        value,
      );

      if (result.isErr()) {
        logger
          .withError(result.error)
          .error("Failed to set user feature flag override");
        throw result.error;
      }

      logger
        .withMetadata({ userId, flagId, value })
        .info("Set user feature flag override");

      return { success: true };
    }),

  deleteUserOverride: protectedProcedure
    .route({
      method: "DELETE",
      path: "/v2/feature-flags/{flagId}/user-override",
    })
    .input(FlagIdParamSchema)
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      const { flagId } = input;

      const result = await featureFlagsService.deleteUserOverride(
        userId,
        flagId,
      );

      if (result.isErr()) {
        logger
          .withError(result.error)
          .error("Failed to delete user feature flag override");
        throw result.error;
      }

      logger
        .withMetadata({ userId, flagId })
        .info("Deleted user feature flag override");

      return { success: true };
    }),
};
