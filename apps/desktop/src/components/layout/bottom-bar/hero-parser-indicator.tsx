import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { ArrowsClockwiseIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

export function HeroParserIndicator() {
  const { t } = useTranslation();
  const heroDetection = usePersistedStore((state) => state.heroDetection);
  const isScanning = heroDetection.status === "scanning";
  const percentage =
    heroDetection.total > 0
      ? Math.round((heroDetection.current / heroDetection.total) * 100)
      : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='flex cursor-default items-center justify-center p-0.5'>
          {isScanning ? (
            <ArrowsClockwiseIcon className='h-3.5 w-3.5 animate-spin text-blue-500' />
          ) : (
            <CheckCircleIcon className='h-3.5 w-3.5 text-status-ok' />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        className='w-48 space-y-1.5 p-2'
        side='top'
        sideOffset={8}>
        {isScanning ? (
          <>
            <p className='text-xs font-medium'>
              {t("heroParser.scanning", {
                current: heroDetection.current + 1,
                total: heroDetection.total,
              })}
            </p>
            {heroDetection.currentModName && (
              <p className='truncate text-xs text-muted-foreground'>
                {t("heroParser.scanningMod", {
                  modName: heroDetection.currentModName,
                })}
              </p>
            )}
            <Progress className='h-1' value={percentage} />
          </>
        ) : (
          <p className='text-xs'>{t("heroParser.idle")}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
