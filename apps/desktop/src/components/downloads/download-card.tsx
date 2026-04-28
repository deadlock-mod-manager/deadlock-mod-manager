import { Button } from "@deadlock-mods/ui/components/button";
import { Card } from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Pause, Play } from "@phosphor-icons/react";
import { type MouseEvent, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { downloadManager } from "@/lib/download/manager";
import { getErrorMessage } from "@/lib/errors";
import { usePersistedStore } from "@/lib/store";
import { cn, formatSize, formatSpeed } from "@/lib/utils";
import { type LocalMod, ModStatus } from "@/types/mods";

type DownloadCardProps = {
  download: LocalMod;
};

type StatusChipVariant = {
  label: string;
  pillClass: string;
  dotClass: string;
};

const getStatusVariant = (status: ModStatus): StatusChipVariant => {
  switch (status) {
    case ModStatus.Downloading:
      return {
        label: "Downloading",
        pillClass: "bg-primary/15 text-primary",
        dotClass: "bg-primary animate-pulse",
      };
    case ModStatus.Extracting:
      return {
        label: "Extracting",
        pillClass: "bg-primary/15 text-primary",
        dotClass: "bg-primary animate-pulse",
      };
    case ModStatus.Paused:
      return {
        label: "Paused",
        pillClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        dotClass: "bg-amber-500",
      };
    case ModStatus.Downloaded:
      return {
        label: "Completed",
        pillClass: "bg-muted text-muted-foreground",
        dotClass: "bg-muted-foreground/70",
      };
    case ModStatus.Installing:
      return {
        label: "Installing",
        pillClass: "bg-primary/10 text-primary/90",
        dotClass: "bg-primary/80 animate-pulse",
      };
    case ModStatus.Installed:
      return {
        label: "Installed",
        pillClass: "bg-primary/15 text-primary",
        dotClass: "bg-primary",
      };
    case ModStatus.FailedToDownload:
      return {
        label: "Failed",
        pillClass: "bg-destructive/15 text-destructive",
        dotClass: "bg-destructive",
      };
    default:
      return {
        label: String(status).toLowerCase(),
        pillClass: "bg-muted text-muted-foreground",
        dotClass: "bg-muted-foreground/70",
      };
  }
};

const StatusChip = ({ status }: { status: ModStatus }) => {
  const { t } = useTranslation();
  const variant = getStatusVariant(status);
  const label =
    status === ModStatus.Paused ? t("downloads.paused") : variant.label;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-[11px]",
        variant.pillClass,
      )}>
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", variant.dotClass)}
      />
      {label}
    </span>
  );
};

const DownloadCard = ({ download }: DownloadCardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getModProgress } = usePersistedStore();
  const modProgress = getModProgress(download.remoteId);
  const isDownloading = download.status === ModStatus.Downloading;
  const isPaused = download.status === ModStatus.Paused;
  const isExtracting = download.status === ModStatus.Extracting;
  const isInProgress = isDownloading || isPaused || isExtracting;
  const percentage = isInProgress ? (modProgress?.percentage ?? 0) : 100;
  const speed = isDownloading ? (modProgress?.speed ?? 0) : 0;
  const totalSize = useMemo(() => {
    if (!download.downloads || download.downloads.length === 0) {
      return 0;
    }
    return download.downloads.reduce((acc, curr) => acc + (curr.size || 0), 0);
  }, [download.downloads]);

  const handleOpen = () => navigate(`/mods/${download.remoteId}`);

  const handlePause = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    downloadManager.pauseDownload(download.remoteId).catch((err: unknown) => {
      toast.error(t("downloads.pauseError", { message: getErrorMessage(err) }));
    });
  };

  const handleResume = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    downloadManager.resumeDownload(download.remoteId).catch((err: unknown) => {
      toast.error(
        t("downloads.resumeError", { message: getErrorMessage(err) }),
      );
    });
  };

  return (
    <Card
      aria-label={`Open ${download.name}`}
      className={cn(
        "group cursor-pointer p-5 transition-all duration-200",
        "hover:-translate-y-px hover:border-primary/40",
        "hover:shadow-[0_4px_24px_-12px_hsl(var(--primary)/0.25)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
      role='button'
      tabIndex={0}>
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0 flex-1'>
          <div className='mb-1.5 flex items-center gap-2'>
            <StatusChip status={download.status} />
          </div>
          <h3
            className='truncate font-semibold text-foreground text-lg leading-tight'
            title={download.name}>
            {download.name}
          </h3>
          {download.author ? (
            <p className='mt-0.5 truncate text-muted-foreground text-sm'>
              by {download.author}
            </p>
          ) : null}
        </div>

        <div className='flex shrink-0 flex-col items-end gap-1 text-right'>
          {totalSize > 0 && (
            <span className='text-foreground text-sm tabular-nums'>
              {formatSize(totalSize)}
            </span>
          )}
          <span
            className={cn(
              "text-xs tabular-nums",
              isDownloading ? "text-primary" : "text-muted-foreground",
            )}>
            {isDownloading
              ? `${formatSpeed(speed)} · ${percentage.toFixed(1)}%`
              : isPaused
                ? `${t("downloads.paused")} · ${percentage.toFixed(1)}%`
                : isExtracting
                  ? t("modStatus.extracting")
                  : `${percentage.toFixed(0)}%`}
          </span>
        </div>
      </div>

      <div className='mt-4 h-2 w-full overflow-hidden rounded-full bg-muted/60'>
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width] duration-500 ease-out",
            (isDownloading || isExtracting) && "downloads-shimmer",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {(isDownloading || isPaused) && (
        <div
          className='mt-3 flex flex-wrap gap-2'
          onClick={(e) => {
            e.stopPropagation();
          }}>
          {isDownloading && (
            <Button
              className='h-8'
              onClick={handlePause}
              size='sm'
              type='button'
              variant='outline'>
              <Pause aria-hidden className='mr-1 size-4' weight='bold' />
              {t("downloads.pause")}
            </Button>
          )}
          {isPaused && (
            <Button
              className='h-8'
              onClick={handleResume}
              size='sm'
              type='button'
              variant='outline'>
              <Play aria-hidden className='mr-1 size-4' weight='fill' />
              {t("downloads.resume")}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
};

export default DownloadCard;
