import { formatByteSize, type ModDto } from "@deadlock-mods/shared";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CheckIcon, PackageIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { getModCoverImage } from "@/lib/mods/mod-images";
import type { ImportProgress } from "@/lib/profiles/types";

export interface RestoreProgressMod {
  mod: ModDto;
  bytes: number;
}

interface RestoreProgressProps {
  progress: ImportProgress | null;
  // In the order the import processes them.
  mods: RestoreProgressMod[];
}

type TileState =
  | "queued"
  | "downloading"
  | "downloaded"
  | "installing"
  | "installed";

// Progress events name the mod being worked on, so everything before it in the
// current phase is finished.
const tileState = (
  index: number,
  activeIndex: number,
  progress: ImportProgress | null,
): TileState => {
  if (progress?.isInstalling) {
    if (index < activeIndex) return "installed";
    return index === activeIndex ? "installing" : "downloaded";
  }
  if (progress?.isDownloading) {
    if (index < activeIndex) return "downloaded";
    return index === activeIndex ? "downloading" : "queued";
  }
  return "queued";
};

export const RestoreProgress = ({ progress, mods }: RestoreProgressProps) => {
  const { t } = useTranslation();
  const activeIndex = progress?.currentMod
    ? mods.findIndex(({ mod }) => mod.name === progress.currentMod)
    : -1;
  const active = activeIndex >= 0 ? mods[activeIndex] : undefined;
  const totalBytes = mods.reduce((sum, { bytes }) => sum + bytes, 0);
  const doneBytes = progress?.isInstalling
    ? totalBytes
    : mods
        .slice(0, Math.max(activeIndex, 0))
        .reduce((sum, { bytes }) => sum + bytes, 0);

  // Downloads fill the first half of the bar and installs the second.
  const phaseShare =
    progress && progress.totalMods > 0
      ? (progress.completedMods / progress.totalMods) * 50
      : 0;
  const percent = progress?.isInstalling
    ? 50 + phaseShare
    : progress?.isDownloading
      ? phaseShare
      : 0;

  const headline =
    active && progress?.isDownloading
      ? t("cloudBackup.restoringDownloading", { name: active.mod.name })
      : active && progress?.isInstalling
        ? t("cloudBackup.restoringInstalling", { name: active.mod.name })
        : t("cloudBackup.restoringPreparing");

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <div className='flex items-baseline justify-between gap-3'>
          <p
            role='status'
            aria-live='polite'
            className='min-w-0 truncate text-sm font-medium'>
            {headline}
          </p>
          {progress && progress.totalMods > 0 && (
            <span className='shrink-0 font-mono text-xs text-muted-foreground tabular-nums'>
              {t("cloudBackup.restoringStep", {
                current: Math.min(
                  progress.completedMods + 1,
                  progress.totalMods,
                ),
                total: progress.totalMods,
              })}
            </span>
          )}
        </div>
        <Progress
          value={percent}
          aria-label={t("cloudBackup.restoring")}
          className='h-1.5 rounded-full [&>div]:rounded-full [&>div]:duration-500 [&>div]:ease-[var(--ease-dmm-smooth)]'
        />
        {totalBytes > 0 && (
          <p className='font-mono text-xs text-muted-foreground tabular-nums'>
            {t("cloudBackup.restoringBytes", {
              done: formatByteSize(doneBytes),
              total: formatByteSize(totalBytes),
            })}
          </p>
        )}
      </div>

      <ul
        aria-hidden
        className='grid max-h-48 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5 overflow-y-auto'>
        {mods.map(({ mod }, index) => {
          const state = tileState(index, activeIndex, progress);
          const cover = getModCoverImage(mod);
          return (
            <li
              key={mod.remoteId}
              title={mod.name}
              className={cn(
                "relative aspect-square overflow-hidden rounded bg-secondary transition-[filter,opacity] duration-500 ease-[var(--ease-dmm-smooth)]",
                state === "queued" && "opacity-40 grayscale",
                (state === "downloading" || state === "installing") &&
                  "ring-2 ring-primary ring-offset-1 ring-offset-background",
              )}>
              {cover ? (
                <img
                  alt=''
                  src={cover}
                  loading='lazy'
                  className='size-full object-cover'
                />
              ) : (
                <PackageIcon
                  weight='duotone'
                  className='m-auto size-full p-3 text-muted-foreground'
                />
              )}
              {state === "downloading" && (
                <span className='absolute inset-0 bg-primary/15 motion-safe:animate-pulse' />
              )}
              {state === "installed" && (
                <span className='absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300'>
                  <CheckIcon weight='bold' className='size-2.5' />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className='text-xs text-muted-foreground'>
        {t("cloudBackup.restoringStayOpen")}
      </p>
    </div>
  );
};
