import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { CommunityConfigSummary } from "@/types/generated/CommunityConfigSummary";
import { outdatedBuild } from "./outdated-build";

/** The card's quieter version: an amber clock beside the date. */
export const OutdatedPatchMark = ({
  community,
  latestBuild,
}: {
  community: CommunityConfigSummary;
  latestBuild: number | null;
}) => {
  const { t } = useTranslation();
  const build = outdatedBuild(community, latestBuild);
  if (build === null) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={t("performance.configs.madeForOlderBuild")}
          className='inline-flex cursor-help rounded-sm text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          role='img'
          tabIndex={0}>
          <ClockCounterClockwiseIcon aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent className='max-w-xs leading-relaxed'>
        {t("performance.configs.outdatedHint", {
          build,
          latest: latestBuild,
        })}
      </TooltipContent>
    </Tooltip>
  );
};
