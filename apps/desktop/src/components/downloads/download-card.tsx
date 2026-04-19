import { Card } from "@deadlock-mods/ui/components/card";
import { useMemo } from "react";
import { useNavigate } from "react-router";
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
  const variant = getStatusVariant(status);
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
      {variant.label}
    </span>
  );
};

const DownloadCard = ({ download }: DownloadCardProps) => {
  const navigate = useNavigate();
  const { getModProgress } = usePersistedStore();
  const modProgress = getModProgress(download.remoteId);
  const isDownloading = download.status === ModStatus.Downloading;
  const percentage = isDownloading ? (modProgress?.percentage ?? 0) : 100;
  const speed = isDownloading ? (modProgress?.speed ?? 0) : 0;
  const totalSize = useMemo(() => {
    if (!download.downloads || download.downloads.length === 0) {
      return 0;
    }
    return download.downloads.reduce((acc, curr) => acc + (curr.size || 0), 0);
  }, [download.downloads]);

  const handleOpen = () => navigate(`/mods/${download.remoteId}`);

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
              : `${percentage.toFixed(0)}%`}
          </span>
        </div>
      </div>

      <div className='mt-4 h-2 w-full overflow-hidden rounded-full bg-muted/60'>
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width] duration-500 ease-out",
            isDownloading && "downloads-shimmer",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </Card>
  );
};

export default DownloadCard;
