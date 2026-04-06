import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import { Progress } from "@deadlock-mods/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  LightningIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import {
  clearAllDetectedHeroes,
  forceRescanAllMods,
  indexUnindexedModsNow,
  startBackgroundScan,
  stopHeroDetection,
} from "@/hooks/use-hero-detection";
import { usePersistedStore } from "@/lib/store";

const INTERVAL_OPTIONS = [15, 30, 45, 60, 120];

export const HeroParserSettings = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const localMods = usePersistedStore((state) => state.localMods);
  const heroDetection = usePersistedStore((state) => state.heroDetection);
  const heroParserIntervalSeconds = usePersistedStore(
    (state) => state.heroParserIntervalSeconds,
  );
  const setHeroParserIntervalSeconds = usePersistedStore(
    (state) => state.setHeroParserIntervalSeconds,
  );

  const isScanning = heroDetection.status === "scanning";
  const indexedCount = localMods.filter(
    (mod) => mod.detectedHero !== undefined,
  ).length;
  const totalCount = localMods.length;
  const unindexedCount = totalCount - indexedCount;
  const allIndexed = totalCount > 0 && unindexedCount === 0;
  const indexPercentage =
    totalCount > 0 ? Math.round((indexedCount / totalCount) * 100) : 0;
  const scanPercentage =
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

  const handleIndexNow = async () => {
    const confirmed = await confirm({
      title: t("heroParser.indexNowTitle"),
      body: t("heroParser.indexNowBody"),
      actionButton: t("heroParser.indexNowConfirm"),
      cancelButton: t("common.cancel"),
      tone: "destructive",
    });
    if (!confirmed) return;
    indexUnindexedModsNow();
  };

  const handleClearIndex = async () => {
    const confirmed = await confirm({
      title: t("heroParser.clearIndexTitle"),
      body: t("heroParser.clearIndexBody"),
      actionButton: t("heroParser.clearIndexConfirm"),
      cancelButton: t("common.cancel"),
      tone: "destructive",
    });
    if (!confirmed) return;
    clearAllDetectedHeroes();
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
        <div className='flex gap-2'>
          {isScanning && (
            <Button onClick={stopHeroDetection} size='sm' variant='destructive'>
              <StopIcon className='h-4 w-4' />
              {t("heroParser.stop")}
            </Button>
          )}
          {!isScanning && unindexedCount > 0 && (
            <Button onClick={startBackgroundScan} size='sm' variant='outline'>
              <PlayIcon className='h-4 w-4' />
              {t("heroParser.startBackgroundScan")}
            </Button>
          )}
          <Button
            disabled={unindexedCount === 0}
            onClick={handleIndexNow}
            size='sm'
            variant='outline'>
            <LightningIcon className='h-4 w-4' />
            {t("heroParser.indexNow")}
          </Button>
          <Button onClick={handleForceRescan} size='sm' variant='outline'>
            <ArrowsClockwiseIcon className='h-4 w-4' />
            {t("heroParser.forceRescan")}
          </Button>
          <Button
            disabled={indexedCount === 0}
            onClick={handleClearIndex}
            size='sm'
            variant='outline'>
            <TrashIcon className='h-4 w-4' />
            {t("heroParser.clearIndex")}
          </Button>
        </div>
      </div>

      {isScanning ? (
        <div className='space-y-2 rounded-md border p-3'>
          <div className='flex items-center justify-between text-xs'>
            <span className='text-muted-foreground'>
              {t("heroParser.scanning", {
                current: heroDetection.current + 1,
                total: heroDetection.total,
              })}
            </span>
            <span className='tabular-nums text-muted-foreground'>
              {scanPercentage}%
            </span>
          </div>
          <Progress className='h-1.5' value={scanPercentage} />
          {heroDetection.currentModName && (
            <p className='truncate text-xs text-muted-foreground'>
              {t("heroParser.scanningMod", {
                modName: heroDetection.currentModName,
              })}
            </p>
          )}
        </div>
      ) : (
        <div className='space-y-2 rounded-md border p-3'>
          <div className='flex items-center justify-between text-xs'>
            <span className='text-muted-foreground'>
              {allIndexed
                ? t("heroParser.allIndexed")
                : t("heroParser.indexedCount", {
                    indexed: indexedCount,
                    total: totalCount,
                  })}
            </span>
            <span className='tabular-nums text-muted-foreground'>
              {indexPercentage}%
            </span>
          </div>
          <Progress className='h-1.5' value={indexPercentage} />
        </div>
      )}

      <div className='flex items-center justify-between'>
        <div className='space-y-1'>
          <Label className='font-bold text-sm'>
            {t("heroParser.intervalLabel")}
          </Label>
          <p className='text-muted-foreground text-sm'>
            {t("heroParser.intervalDescription")}
          </p>
        </div>
        <Select
          value={String(heroParserIntervalSeconds)}
          onValueChange={(v) =>
            setHeroParserIntervalSeconds(Number.parseInt(v, 10))
          }>
          <SelectTrigger className='w-32'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERVAL_OPTIONS.map((seconds) => (
              <SelectItem key={seconds} value={String(seconds)}>
                {t("heroParser.intervalSeconds", { seconds })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
