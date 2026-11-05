import type { CommunityConfigSummary } from "@/types/generated/CommunityConfigSummary";

/** The build the config was made on, when it predates the newest one we know. */
export const outdatedBuild = (
  community: CommunityConfigSummary,
  latestBuild: number | null,
): number | null =>
  community.baseBuild !== null &&
  latestBuild !== null &&
  community.baseBuild < latestBuild
    ? community.baseBuild
    : null;
