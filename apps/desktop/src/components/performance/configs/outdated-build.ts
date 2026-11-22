import type { CommunityConfigSummary } from "@/types/generated/CommunityConfigSummary";

export const outdatedBuild = (
  community: CommunityConfigSummary,
  latestBuild: number | null,
): number | null =>
  community.baseBuild !== null &&
  latestBuild !== null &&
  community.baseBuild < latestBuild
    ? community.baseBuild
    : null;
