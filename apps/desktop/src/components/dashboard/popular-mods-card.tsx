import type { ModDto } from "@deadlock-mods/shared";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { FireIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getMods } from "@/lib/api";
import { STALE_TIME_API } from "@/lib/query-constants";
import { DashboardCard } from "./dashboard-card";
import { PopularModItem } from "./popular-mod-item";

export const PopularModsCard = () => {
  const { t } = useTranslation();
  const { data: mods, isPending } = useQuery({
    queryKey: ["mods"],
    queryFn: getMods,
    staleTime: STALE_TIME_API,
    refetchOnWindowFocus: false,
  });

  const popularMods = mods
    ?.sort((a, b) => b.downloadCount - a.downloadCount)
    .slice(0, 5);

  const renderContent = () => {
    if (isPending) {
      return Array.from({ length: 5 }).map(() => (
        <div key={crypto.randomUUID()} className='flex items-start gap-3'>
          <Skeleton className='h-6 w-6 rounded-full' />
          <Skeleton className='h-12 w-12 rounded-md' />
          <div className='flex-1 space-y-2'>
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-3 w-1/2' />
          </div>
        </div>
      ));
    }

    if (popularMods && popularMods.length > 0) {
      return popularMods.map((mod: ModDto, index: number) => (
        <PopularModItem key={mod.id} mod={mod} index={index} />
      ));
    }

    return (
      <p className='text-center text-muted-foreground text-sm'>
        {t("dashboard.noModsAvailable")}
      </p>
    );
  };

  return (
    <DashboardCard
      icon={<FireIcon className='h-5 w-5 text-orange-500' weight='duotone' />}
      title={t("dashboard.popularMods")}>
      <div className='space-y-3'>{renderContent()}</div>
    </DashboardCard>
  );
};
