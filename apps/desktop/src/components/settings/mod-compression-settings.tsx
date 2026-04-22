import { Badge } from "@deadlock-mods/ui/components/badge";
import { Label } from "@deadlock-mods/ui/components/label";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  PauseCircleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { BackupBeforeCompressionDialog } from "@/components/settings/backup-before-compression-dialog";
import { useModCompression } from "@/hooks/use-mod-compression";
import { isGameRunning } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import type { CompressionLevel } from "@/lib/store/slices/compression";
import { cn } from "@/lib/utils";

type LevelOption = {
  value: CompressionLevel;
  subKey: string;
  recommended?: boolean;
};

const LEVELS: LevelOption[] = [
  { value: "low", subKey: "lowSubtitle", recommended: true },
  { value: "medium", subKey: "mediumSubtitle" },
  { value: "high", subKey: "highSubtitle" },
  { value: "extreme", subKey: "extremeSubtitle" },
];

export const ModCompressionSettings = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [backupOpen, setBackupOpen] = useState(false);
  const gamePath = usePersistedStore((state) => state.gamePath);
  const compressionEnabled = usePersistedStore(
    (state) => state.compressionEnabled,
  );
  const compressionLevel = usePersistedStore(
    (state) => state.compressionLevel,
  );
  const setCompressionLevel = usePersistedStore(
    (state) => state.setCompressionLevel,
  );
  const compressionProgress = usePersistedStore(
    (state) => state.compressionProgress,
  );
  const { enableCompression, changeCompressionLevel, disableCompression } =
    useModCompression();

  const { data: gameRunning } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: () => isGameRunning(),
    staleTime: STALE_TIME_POLL,
    refetchInterval: 5000,
    enabled: !!gamePath,
  });

  const isBusy =
    compressionProgress.status === "merging" ||
    compressionProgress.status === "extracting";
  const isPaused = compressionProgress.status === "paused";
  const pct =
    compressionProgress.total > 0
      ? Math.round(
          (compressionProgress.current / compressionProgress.total) * 100,
        )
      : 0;

  const controlsDisabled = isBusy || gameRunning === true;

  const handleLevelChange = (next: CompressionLevel) => {
    if (next === compressionLevel) return;
    if (!compressionEnabled) {
      setCompressionLevel(next);
      return;
    }
    void (async () => {
      const ok = await confirm({
        title: t("settings.modCompression.level.changeConfirmTitle"),
        body: t("settings.modCompression.level.changeConfirmBody"),
        actionButton: t("common.confirm"),
        cancelButton: t("common.cancel"),
        tone: "default",
      });
      if (!ok) return;
      try {
        await changeCompressionLevel(next);
      } catch (e) {
        toast.error(getErrorMessage(e));
      }
    })();
  };

  const handleToggle = async (next: boolean) => {
    if (gameRunning === true) {
      toast.error(t("settings.modCompression.gameRunning"));
      return;
    }
    if (next) {
      const ok = await confirm({
        title: t("settings.modCompression.enableConfirmTitle"),
        body: t("settings.modCompression.enableConfirmBody"),
        actionButton: t("settings.modCompression.enableConfirmAction"),
        cancelButton: t("common.cancel"),
        tone: "destructive",
      });
      if (!ok) return;
      setBackupOpen(true);
    } else {
      const ok = await confirm({
        title: t("settings.modCompression.disableConfirmTitle"),
        body: t("settings.modCompression.disableConfirmBody"),
        actionButton: t("settings.modCompression.disableConfirmAction"),
        cancelButton: t("common.cancel"),
        tone: "destructive",
      });
      if (!ok) return;
      try {
        await disableCompression();
      } catch (e) {
        toast.error(getErrorMessage(e));
      }
    }
  };

  const statusLabel = isBusy
    ? compressionProgress.status === "merging"
      ? t("modCompression.merging", {
          current: compressionProgress.current,
          total: compressionProgress.total,
        })
      : t("modCompression.extracting", {
          current: compressionProgress.current,
          total: compressionProgress.total,
        })
    : isPaused
      ? t("modCompression.paused")
      : t("modCompression.idle");

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-4'>
        <div className='space-y-1'>
          <Label
            className='font-bold text-sm'
            htmlFor='toggle-mod-compression'>
            {t("settings.modCompression.enableLabel")}
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Switch
            checked={compressionEnabled}
            disabled={isBusy || gameRunning === true}
            id='toggle-mod-compression'
            onCheckedChange={(v) => void handleToggle(v)}
          />
          <Label htmlFor='toggle-mod-compression'>
            {compressionEnabled ? t("status.enabled") : t("status.disabled")}
          </Label>
        </div>
      </div>

      <div className='space-y-3'>
        <div className='space-y-1'>
          <Label className='font-bold text-sm'>
            {t("settings.modCompression.level.title")}
          </Label>
          <p className='text-muted-foreground text-sm'>
            {t("settings.modCompression.level.description")}
          </p>
        </div>
        <div
          aria-disabled={controlsDisabled}
          className={cn(
            "grid grid-cols-2 gap-2 sm:grid-cols-4",
            controlsDisabled && "pointer-events-none opacity-60",
          )}
          role='radiogroup'>
          {LEVELS.map(({ value, subKey, recommended }) => {
            const isActive = value === compressionLevel;
            return (
              <button
                aria-checked={isActive}
                aria-label={t(`settings.modCompression.level.${value}`)}
                className={cn(
                  "relative flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors",
                  "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border/50 bg-background/40",
                )}
                disabled={controlsDisabled}
                key={value}
                onClick={() => handleLevelChange(value)}
                role='radio'
                type='button'>
                <div className='flex w-full items-center justify-between gap-2'>
                  <span className='text-sm font-medium'>
                    {t(`settings.modCompression.level.${value}`)}
                  </span>
                  {recommended ? (
                    <Badge
                      className='h-4 px-1.5 text-[10px]'
                      variant='secondary'>
                      {t("settings.modCompression.level.recommended")}
                    </Badge>
                  ) : null}
                </div>
                <span className='text-muted-foreground text-xs leading-tight'>
                  {t(`settings.modCompression.level.${subKey}`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className='space-y-2 rounded-md border p-3'>
        <div className='flex items-center justify-between gap-3'>
          <div className='flex items-center gap-3'>
            {isBusy ? (
              <ArrowsClockwiseIcon className='h-5 w-5 animate-spin text-blue-500' />
            ) : isPaused ? (
              <PauseCircleIcon className='h-5 w-5 text-amber-500' />
            ) : (
              <CheckCircleIcon className='h-5 w-5 text-primary' />
            )}
            <p className='text-sm font-medium'>{statusLabel}</p>
          </div>
          {isBusy ? (
            <span className='tabular-nums text-muted-foreground text-xs'>
              {pct}%
            </span>
          ) : null}
        </div>
        {isBusy ? <Progress className='h-1.5' value={pct} /> : null}
        {isBusy && compressionProgress.currentModName ? (
          <p className='truncate text-muted-foreground text-xs'>
            {compressionProgress.currentModName}
          </p>
        ) : null}
      </div>

      <BackupBeforeCompressionDialog
        onConfirm={async (createBackup) => {
          try {
            await enableCompression({ createBackup });
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        }}
        onOpenChange={setBackupOpen}
        open={backupOpen}
      />
    </div>
  );
};
