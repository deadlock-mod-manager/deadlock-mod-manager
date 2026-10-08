import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  GlobeIcon,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  type CommunityListItem,
  gameBananaImportSource,
} from "@/lib/performance/config-list";
import { formatCompact } from "@/lib/stats/format";
import type { CommunityConfigSummary } from "@/types/generated/CommunityConfigSummary";
import { usePerformanceUi } from "../performance-context";
import { ApplyConfigButton } from "./apply-config-button";
import {
  CardFooter,
  Chip,
  ConfigCardShell,
  TierLabel,
  TierMeter,
} from "./card-parts";

/** "Made for the April patch" when the config predates the newest build we know. */
export const OutdatedPatchChip = ({
  community,
  latestBuild,
}: {
  community: CommunityConfigSummary;
  latestBuild: number | null;
}) => {
  const { t, i18n } = useTranslation();
  if (
    community.baseBuild === null ||
    latestBuild === null ||
    community.baseBuild >= latestBuild
  ) {
    return null;
  }
  return (
    <Chip
      icon={<ClockCounterClockwiseIcon aria-hidden />}
      title={t("performance.configs.outdatedHint", {
        build: community.baseBuild,
        latest: latestBuild,
      })}
      tone='warning'>
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

export const CommunityCard = ({
  item,
  active,
  latestBuild,
}: {
  item: CommunityListItem;
  active: boolean;
  latestBuild: number | null;
}) => {
  const { t } = useTranslation();
  const { openDetails, openImport } = usePerformanceUi();
  const { community, imported } = item;

  return (
    <ConfigCardShell active={active}>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <TierLabel tier={community.tier} />
          {imported && (
            <Badge className='px-1.5 py-0 text-[11px]' variant='secondary'>
              {t("performance.configs.imported")}
            </Badge>
          )}
        </div>
        <TierMeter tier={community.tier} />
      </div>
      <div className='min-w-0'>
        <h3 className='truncate font-semibold text-base' title={community.name}>
          {community.name}
        </h3>
        <p className='truncate text-muted-foreground text-xs'>
          {t("performance.configs.by", { author: community.author })}
        </p>
      </div>
      <p className='line-clamp-2 text-muted-foreground text-sm'>
        {community.blurb}
      </p>
      <div className='flex flex-wrap gap-1.5'>
        <Chip icon={<DownloadSimpleIcon aria-hidden />}>
          {t("performance.configs.downloads", {
            count: community.downloads,
            formatted: formatCompact(community.downloads),
          })}
        </Chip>
        {community.settingsCount > 0 && (
          <Chip>
            {t("performance.configs.settingsCount", {
              count: community.settingsCount,
            })}
          </Chip>
        )}
        <OutdatedPatchChip community={community} latestBuild={latestBuild} />
      </div>
      <CardFooter
        source={
          <>
            <GlobeIcon aria-hidden />
            {community.updatedAt
              ? t("performance.configs.sourceWithTime", {
                  source: t("performance.configs.sources.gamebanana"),
                  time: formatDistanceToNow(new Date(community.updatedAt), {
                    addSuffix: true,
                  }),
                })
              : t("performance.configs.sources.gamebanana")}
          </>
        }>
        <Button
          onClick={() => openDetails(imported ? imported.id : item.configId)}
          size='sm'
          variant='ghost'>
          {t("performance.configs.details")}
        </Button>
        {imported ? (
          <ApplyConfigButton
            config={{ kind: "user", config: imported }}
            entryPoint='card'
          />
        ) : (
          <Button
            icon={<DownloadSimpleIcon aria-hidden />}
            onClick={() => openImport(gameBananaImportSource(community))}
            size='sm'
            variant='outline'>
            {t("performance.configs.downloadAndReview")}
          </Button>
        )}
      </CardFooter>
    </ConfigCardShell>
  );
};
