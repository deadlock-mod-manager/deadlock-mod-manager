import { Button } from "@deadlock-mods/ui/components/button";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { ArrowsClockwiseIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { forceRescanAllMods } from "@/hooks/use-hero-detection";
import { usePersistedStore } from "@/lib/store";

export const HeroParserSettings = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const localMods = usePersistedStore((state) => state.localMods);
  const heroDetection = usePersistedStore((state) => state.heroDetection);

  const isScanning = heroDetection.status === "scanning";
  const indexedCount = localMods.filter(
    (mod) => mod.detectedHero !== undefined,
  ).length;
  const totalCount = localMods.length;
  const percentage =
    heroDetection.total > 0
      ? Math.round((heroDetection.current / heroDetection.total) * 100)
      : 0;

  const handleForceRescan = async () => {
    const confirmed = await confirm({
      title: t("heroParser.forceRescanTitle"),
      body: t("heroParser.forceRescanBody"),
      actionButton: t("heroParser.forceRescanConfirm"),
      cancelButton: t("common.cancel"),
      tone: "destructive",
    });
    if (!confirmed) return;
    forceRescanAllMods();
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          {isScanning ? (
            <ArrowsClockwiseIcon className='h-5 w-5 animate-spin text-blue-500' />
          ) : (
            <CheckCircleIcon className='h-5 w-5 text-primary' />
          )}
          <div className='space-y-0.5'>
            <p className='text-sm font-medium'>
              {isScanning
                ? t("heroParser.statusScanning")
                : t("heroParser.statusIdle")}
            </p>
            <p className='text-xs text-muted-foreground'>
              {t("heroParser.indexedCount", {
                indexed: indexedCount,
                total: totalCount,
              })}
            </p>
          </div>
        </div>
        <Button
          disabled={isScanning}
          onClick={handleForceRescan}
          size='sm'
          variant='outline'>
          <ArrowsClockwiseIcon className='h-4 w-4' />
          {t("heroParser.forceRescan")}
        </Button>
      </div>

      {isScanning && (
        <div className='space-y-2 rounded-md border p-3'>
          <div className='flex items-center justify-between text-xs'>
            <span className='text-muted-foreground'>
              {t("heroParser.scanning", {
                current: heroDetection.current + 1,
                total: heroDetection.total,
              })}
            </span>
            <span className='tabular-nums text-muted-foreground'>
              {percentage}%
            </span>
          </div>
          <Progress className='h-1.5' value={percentage} />
          {heroDetection.currentModName && (
            <p className='truncate text-xs text-muted-foreground'>
              {t("heroParser.scanningMod", {
                modName: heroDetection.currentModName,
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
