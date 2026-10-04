import type { ModDto } from "@deadlock-mods/shared";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { ClockIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CATALOG_QUERY_DEFAULTS,
  queryGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import { MODS_LIST_QUERY_KEY } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { DashboardCard } from "./dashboard-card";
import { LatestModItem } from "./latest-mod-item";

const LATEST_MODS_COUNT = 5;

export const LatestModsCard = () => {
  const { t } = useTranslation();
  const hideNSFW = usePersistedStore((state) => state.nsfwSettings.hideNSFW);
  const { data: latestMods, isPending } = useQuery({
    queryKey: [...MODS_LIST_QUERY_KEY, "latest", { hideNSFW }],
    queryFn: async () => {
      const page = await queryGameBananaCatalog({
        ...CATALOG_QUERY_DEFAULTS,
        hideNsfw: hideNSFW,
        sort: "releaseDate",
        pageSize: LATEST_MODS_COUNT,
      });
      return page.items;
    },
    staleTime: STALE_TIME_API,
    refetchOnWindowFocus: false,
  });

  const modsContent =
    latestMods && latestMods.length > 0 ? (
      latestMods.map((mod: ModDto) => <LatestModItem key={mod.id} mod={mod} />)
    ) : (
      <p className='text-center text-muted-foreground text-sm'>
        {t("dashboard.noModsAvailable")}
      </p>
    );

  return (
    <DashboardCard
      icon={<ClockIcon className='h-5 w-5' weight='duotone' />}
      title={t("dashboard.latestMods")}>
      <div className='space-y-3'>
        {isPending
          ? Array.from({ length: 5 }).map(() => (
              <div key={crypto.randomUUID()} className='flex items-start gap-3'>
                <Skeleton className='h-12 w-12 rounded-md' />
                <div className='flex-1 space-y-2'>
                  <Skeleton className='h-4 w-3/4' />
                  <Skeleton className='h-3 w-1/2' />
                </div>
              </div>
            ))
          : modsContent}
      </div>
    </DashboardCard>
  );
};
