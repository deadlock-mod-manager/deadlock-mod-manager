import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { CommunityConfigSummary } from "@/types/generated/CommunityConfigSummary";
import { Chip } from "./card-parts";
import { outdatedBuild } from "./outdated-build";

/** "Made for the April patch" when the config predates the newest build we know. */
export const OutdatedPatchChip = ({
  community,
  latestBuild,
}: {
  community: CommunityConfigSummary;
  latestBuild: number | null;
}) => {
  const { t, i18n } = useTranslation();
  const build = outdatedBuild(community, latestBuild);
  if (build === null) return null;
  return (
    <Chip
      icon={<ClockCounterClockwiseIcon aria-hidden />}
      tone='warning'
      tooltip={t("performance.configs.outdatedHint", {
        build,
        latest: latestBuild,
      })}>
      {community.updatedAt
        ? t("performance.configs.updatedIn", {
            month: new Date(community.updatedAt).toLocaleDateString(
              i18n.language,
              { month: "short", year: "numeric" },
            ),
          })
        : t("performance.configs.madeForOlderBuild")}
    </Chip>
  );
};
