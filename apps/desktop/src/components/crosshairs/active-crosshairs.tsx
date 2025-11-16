import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { CrosshairIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import { CrosshairCard } from "./crosshair-card";

export const ActiveCrosshairs = () => {
  const { t } = useTranslation();
  const activeCrosshairHistory = usePersistedStore(
    (state) => state.activeCrosshairHistory,
  );

  if (activeCrosshairHistory.length === 0) {
    return (
      <div className='mb-6'>
        <h2 className='text-lg font-semibold mb-4'>
          {t("crosshairs.activeCrosshairs")}
        </h2>
        <Card>
          <CardContent className='p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground'>
            <CrosshairIcon className='h-12 w-12 opacity-50' />
            <p className='text-sm'>{t("crosshairs.noActiveCrosshair")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='mb-6'>
      <h2 className='text-lg font-semibold mb-4'>
        {t("crosshairs.activeCrosshairs")}
      </h2>
      <div className='flex gap-4 overflow-x-auto scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin pb-2'>
        {activeCrosshairHistory.map(
          (config: CrosshairConfig, index: number) => (
            <div key={index} className='flex-shrink-0 w-[200px]'>
              <CrosshairCard config={config} isActive={index === 0} />
            </div>
          ),
        )}
      </div>
    </div>
  );
};
