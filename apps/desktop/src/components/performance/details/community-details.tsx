import { Button } from "@deadlock-mods/ui/components/button";
import { DownloadSimpleIcon, GlobeIcon, UserIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import {
  type CommunityListItem,
  gameBananaImportSource,
} from "@/lib/performance/config-list";
import { formatCompact } from "@/lib/stats/format";
import { Chip } from "../configs/card-parts";
import { OutdatedPatchChip } from "../configs/community-card";
import { usePerformanceUi } from "../performance-context";
import { DetailsHeader, LinkChip } from "./details-header";
import { DetailsSection } from "./details-parts";

/** A GameBanana config we only know from the catalog until the user imports it. */
export const CommunityDetails = ({
  item,
  latestBuild,
}: {
  item: CommunityListItem;
  latestBuild: number | null;
}) => {
  const { t, i18n } = useTranslation();
  const { openDetails, openImport } = usePerformanceUi();
  const { community, imported } = item;

  const stats = [
    {
      label: t("performance.details.community.settings"),
      value: community.settingsCount.toLocaleString(i18n.language),
    },
    {
      label: t("performance.details.community.engineEdits"),
      value: community.engineEditCount.toLocaleString(i18n.language),
    },
    {
      label: t("performance.details.community.downloads"),
      value: formatCompact(community.downloads),
    },
    {
      label: t("performance.details.community.baseBuild"),
      value:
        community.baseBuild === null
          ? t("performance.details.community.unknownBuild")
          : String(community.baseBuild),
    },
  ];

  const downloadAndReview = () => {
    openDetails(null);
    openImport(gameBananaImportSource(community));
  };

  return (
    <>
      <DetailsHeader
        blurb={community.blurb}
        chips={
          <>
            <Chip icon={<UserIcon aria-hidden />}>
              {t("performance.configs.by", { author: community.author })}
            </Chip>
            <OutdatedPatchChip
              community={community}
              latestBuild={latestBuild}
            />
            <LinkChip
              icon={<GlobeIcon aria-hidden />}
              url={`https://gamebanana.com/mods/${community.gamebananaId}`}>
              {t("performance.configs.sources.gamebanana")}
            </LinkChip>
          </>
        }
        name={community.name}
        tier={community.tier}
      />
      <div className='flex-1 space-y-6 overflow-y-auto px-6 py-5'>
        <DetailsSection
          description={t("performance.details.community.statsDescription")}
          title={t("performance.details.community.statsTitle")}>
          <dl className='grid grid-cols-2 gap-2'>
            {stats.map((stat) => (
              <div className='rounded-md border px-3 py-2' key={stat.label}>
                <dt className='text-muted-foreground text-xs'>{stat.label}</dt>
                <dd className='font-semibold tabular-nums'>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </DetailsSection>
        <p className='text-muted-foreground text-xs'>
          {imported
            ? t("performance.details.community.imported", {
                name: imported.name,
              })
            : t("performance.details.community.reviewNote")}
        </p>
      </div>
      <div className='flex items-center justify-end gap-2 border-t px-6 py-3'>
        {imported && (
          <Button onClick={() => openDetails(imported.id)} variant='outline'>
            {t("performance.details.community.openCopy")}
          </Button>
        )}
        <Button
          icon={<DownloadSimpleIcon aria-hidden />}
          onClick={downloadAndReview}
          variant={imported ? "ghost" : "default"}>
          {t("performance.configs.downloadAndReview")}
        </Button>
      </div>
    </>
  );
};
