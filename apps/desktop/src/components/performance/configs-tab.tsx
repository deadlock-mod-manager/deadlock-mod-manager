import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  DownloadSimpleIcon,
  GaugeIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePerfConfigList } from "@/hooks/performance/use-perf-config-list";
import { getErrorMessage } from "@/lib/errors";
import {
  type ConfigListItem,
  type ConfigSort,
  type ConfigSourceFilter,
  filterConfigs,
  sortConfigs,
  sourceCounts,
} from "@/lib/performance/config-list";
import type { PerfTier } from "@/types/generated/PerfTier";
import { CommunityCard } from "./configs/community-card";
import { ConfigToolbar } from "./configs/config-toolbar";
import { LooksFramesScale } from "./configs/looks-frames-scale";
import { PresetCard } from "./configs/preset-card";
import { UserConfigCard } from "./configs/user-config-card";
import { usePerformanceUi } from "./performance-context";

const ConfigCard = ({
  item,
  activeConfigId,
  latestBuild,
}: {
  item: ConfigListItem;
  activeConfigId: string | null;
  latestBuild: number | null;
}) => {
  switch (item.kind) {
    case "preset":
      return (
        <PresetCard active={item.configId === activeConfigId} item={item} />
      );
    case "community":
      return (
        <CommunityCard
          active={
            activeConfigId !== null && item.imported?.id === activeConfigId
          }
          item={item}
          latestBuild={latestBuild}
        />
      );
    case "user":
      return (
        <UserConfigCard active={item.configId === activeConfigId} item={item} />
      );
  }
};

const ConfigsSkeleton = () => (
  <div className='flex flex-col gap-4'>
    <Skeleton className='h-36 w-full rounded-lg' />
    <Skeleton className='h-8 w-80' />
    <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
      {["a", "b", "c", "d", "e", "f"].map((key) => (
        <Skeleton className='h-52 rounded-lg' key={key} />
      ))}
    </div>
  </div>
);

export const ConfigsTab = () => {
  const { t } = useTranslation();
  const { openImport } = usePerformanceUi();
  const { catalogQuery, items, activeConfigId, activeCutScore } =
    usePerfConfigList();
  const [source, setSource] = useState<ConfigSourceFilter>("all");
  const [sort, setSort] = useState<ConfigSort>("downloads");
  const [tier, setTier] = useState<PerfTier | null>(null);

  const visible = useMemo(
    () => sortConfigs(filterConfigs(items, { source, tier }), sort),
    [items, source, tier, sort],
  );
  const counts = useMemo(() => sourceCounts(items, tier), [items, tier]);

  if (catalogQuery.isPending) return <ConfigsSkeleton />;

  const latestBuild = catalogQuery.data?.latestBuild ?? null;
  const hasFilters = source !== "all" || tier !== null;

  return (
    <div className='flex flex-col gap-6'>
      {catalogQuery.isError && (
        <Alert variant='warning'>
          <WarningIcon className='size-4 shrink-0' />
          <div className='flex-1'>
            <AlertTitle>{t("performance.configs.catalogError")}</AlertTitle>
            <AlertDescription>
              {getErrorMessage(catalogQuery.error)}
            </AlertDescription>
          </div>
          <Button
            isLoading={catalogQuery.isRefetching}
            onClick={() => catalogQuery.refetch()}
            size='sm'
            variant='outline'>
            {t("performance.configs.retry")}
          </Button>
        </Alert>
      )}

      {items.length > 0 && (
        <LooksFramesScale
          activeConfigId={activeConfigId}
          activeCutScore={activeCutScore}
          items={items}
          onSelectTier={setTier}
          selectedTier={tier}
        />
      )}

      {items.length > 0 && (
        <ConfigToolbar
          counts={counts}
          onSortChange={setSort}
          onSourceChange={setSource}
          sort={sort}
          source={source}
        />
      )}

      {visible.length > 0 ? (
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {visible.map((item) => (
            <ConfigCard
              activeConfigId={activeConfigId}
              item={item}
              key={item.configId}
              latestBuild={latestBuild}
            />
          ))}
        </div>
      ) : (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <GaugeIcon />
            </EmptyMedia>
            <EmptyTitle>
              {hasFilters
                ? t("performance.configs.empty.filteredTitle")
                : t("performance.configs.empty.title")}
            </EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? t("performance.configs.empty.filteredDescription")
                : t("performance.configs.empty.description")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {hasFilters ? (
              <Button
                onClick={() => {
                  setSource("all");
                  setTier(null);
                }}
                size='sm'
                variant='outline'>
                {t("performance.configs.empty.clearFilters")}
              </Button>
            ) : (
              <Button
                icon={<DownloadSimpleIcon aria-hidden />}
                onClick={() => openImport()}
                size='sm'>
                {t("performance.header.import")}
              </Button>
            )}
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
};
