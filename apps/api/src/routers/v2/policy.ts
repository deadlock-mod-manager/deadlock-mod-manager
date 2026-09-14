import { policyManifestSchema } from "@deadlock-mods/shared";
import { publicProcedure } from "@/lib/orpc";
import { getPolicyManifest } from "@/services/policy-manifest";

export const policyRouter = {
  getPolicyManifest: publicProcedure
    .route({ method: "GET", path: "/v2/policy-manifest" })
    .output(policyManifestSchema)
    .handler(async ({ context }) => {
      context.resHeaders?.set(
        "Cache-Control",
        "public, max-age=300, stale-if-error=86400",
      );
      return await getPolicyManifest();
    }),
};
