import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  DownloadSimpleIcon,
  GlobeIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  type CommunityListItem,
  gameBananaImportSource,
} from "@/lib/performance/config-list";
import { formatCompact } from "@/lib/stats/format";
import { usePerformanceUi } from "../performance-context";
import { ApplyConfigButton } from "./apply-config-button";
import { OutdatedPatchMark } from "./outdated-patch-mark";
import {
  CardFooter,
  CardHeader,
  ConfigCardShell,
  MetaItem,
  MetaRow,
  TierLabel,
} from "./card-parts";

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
  const sourceName = t("performance.configs.sources.gamebanana");

  return (
    <ConfigCardShell active={active} configId={item.configId}>
      <CardHeader
        label={
          <>
            <TierLabel tier={community.tier} />
            {imported && (
              <Badge className='px-1.5 py-0 text-[11px]' variant='secondary'>
                {t("performance.configs.imported")}
              </Badge>
            )}
          </>
        }
        provenance={
          <>
            <GlobeIcon aria-hidden />
            {community.updatedAt ? (
              <>
                <span className='sr-only'>{sourceName}</span>
                {formatDistanceToNow(new Date(community.updatedAt), {
                  addSuffix: true,
                })}
              </>
            ) : (
              sourceName
            )}
            <OutdatedPatchMark
              community={community}
              latestBuild={latestBuild}
            />
          </>
        }
      />
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
      <MetaRow>
        <MetaItem icon={<DownloadSimpleIcon aria-hidden />}>
          {t("performance.configs.downloads", {
            count: community.downloads,
            formatted: formatCompact(community.downloads),
          })}
        </MetaItem>
        {community.settingsCount > 0 && (
          <MetaItem icon={<SlidersHorizontalIcon aria-hidden />}>
            {t("performance.configs.settingsCount", {
              count: community.settingsCount,
            })}
          </MetaItem>
        )}
      </MetaRow>
      <CardFooter>
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
