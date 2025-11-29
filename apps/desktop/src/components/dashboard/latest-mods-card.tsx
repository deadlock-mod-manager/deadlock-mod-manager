import type { ModDto } from "@deadlock-mods/shared";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { Clock } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getMods } from "@/lib/api";
import { DashboardCard } from "./dashboard-card";
import { LatestModItem } from "./latest-mod-item";

export const LatestModsCard = () => {
  const { t } = useTranslation();
  const { data: mods, isPending } = useQuery({
    queryKey: ["mods"],
    queryFn: getMods,
  });

  const latestMods = mods
    ?.sort(
      (a, b) =>
        new Date(b.remoteAddedAt).getTime() -
        new Date(a.remoteAddedAt).getTime(),
    )
    .slice(0, 5);

  return (
    <DashboardCard
      icon={<Clock className='h-5 w-5' weight='duotone' />}
      title={t("dashboard.latestMods")}>
      <div className='space-y-3'>
        {isPending ? (
          Array.from({ length: 5 }).map(() => (
            <div key={crypto.randomUUID()} className='flex items-start gap-3'>
              <Skeleton className='h-12 w-12 rounded-md' />
              <div className='flex-1 space-y-2'>
                <Skeleton className='h-4 w-3/4' />
                <Skeleton className='h-3 w-1/2' />
              </div>
            </div>
          ))
        ) : latestMods && latestMods.length > 0 ? (
          latestMods.map((mod: ModDto) => (
            <LatestModItem key={mod.id} mod={mod} />
          ))
        ) : (
          <p className='text-center text-muted-foreground text-sm'>
            {t("dashboard.noModsAvailable")}
          </p>
        )}
      </div>
    </DashboardCard>
  );
};
