import { Badge } from "@deadlock-mods/ui/components/badge";
import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  CalendarBlankIcon,
  DownloadSimpleIcon,
  HeartIcon,
  type Icon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { modThumbnail, type PreviewMod } from "./mods";
import { formatCount, formatDate, usePreviewState } from "./preview-state";

// The snapshot's "today", so "Updated recently" stays stable over time.
const SNAPSHOT_DATE = Date.parse("2026-10-05T00:00:00Z");
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

export const isRecentlyUpdated = (mod: PreviewMod) =>
  SNAPSHOT_DATE - Date.parse(`${mod.updatedAt}T00:00:00Z`) <= RECENT_MS;

export const PageTitle = ({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle: string;
  className?: string;
}) => (
  <div className={cn("flex flex-col justify-center pt-4", className)}>
    <h3 className='font-bold text-2xl'>{title}</h3>
    <p className='text-muted-foreground'>{subtitle}</p>
  </div>
);

export const EmptyState = ({
  icon: EmptyIcon,
  title,
  description,
  children,
}: {
  icon: Icon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) => (
  <div className='flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center'>
    <EmptyIcon weight='duotone' className='size-16 text-muted-foreground' />
    <div className='font-semibold text-lg'>{title}</div>
    <p className='max-w-sm text-muted-foreground text-sm'>{description}</p>
    {children && <div className='mt-2 flex gap-2'>{children}</div>}
  </div>
);

/** The Mods Store card (apps/desktop/src/components/mod-browsing/mod-card.tsx). */
export const ModCard = ({ mod }: { mod: PreviewMod }) => {
  const { installs, download, toggle } = usePreviewState();
  const install = installs[mod.id];

  return (
    <article className='group flex h-full flex-col overflow-hidden rounded-xl border bg-card'>
      <div className='relative overflow-hidden'>
        <img
          src={modThumbnail(mod)}
          alt=''
          width={480}
          height={360}
          loading='lazy'
          className='aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]'
        />
        <div className='absolute inset-x-0 bottom-0 flex items-end justify-end gap-1 bg-linear-to-t from-black/60 to-transparent px-2 pt-6 pb-2'>
          {install?.status === "installed" && <Badge>Installed</Badge>}
          {isRecentlyUpdated(mod) && (
            <Badge variant='secondary'>
              <SparkleIcon weight='fill' className='mr-1 size-3' />
              Updated recently
            </Badge>
          )}
        </div>
      </div>
      <div className='flex flex-1 flex-col gap-1 px-3 py-4'>
        <h4 className='truncate font-semibold leading-tight'>{mod.name}</h4>
        <p className='truncate text-muted-foreground text-sm'>
          By {mod.author}
        </p>
        <div className='mt-auto flex items-end justify-between gap-2 pt-2'>
          <div className='flex flex-col gap-1.5 text-muted-foreground text-xs'>
            <span className='flex items-center gap-1 tabular-nums'>
              <DownloadSimpleIcon className='size-3' />
              {formatCount(mod.downloads)}
              <HeartIcon className='ml-2 size-3' />
              {formatCount(mod.likes)}
            </span>
            <span className='flex items-center gap-1'>
              <CalendarBlankIcon className='size-3' />
              {formatDate(mod.updatedAt)}
            </span>
          </div>
          {install?.status === "installed" ? (
            <Switch
              checked={install.enabled}
              onCheckedChange={() => toggle(mod.id)}
              aria-label={`Enable ${mod.name}`}
            />
          ) : install?.status === "downloading" ? (
            <span
              role='progressbar'
              aria-label={`Downloading ${mod.name}`}
              aria-valuenow={Math.round(install.progress)}
              className='relative flex size-9 items-center justify-center rounded-md border border-input font-medium text-[10px] tabular-nums'
              style={{
                background: `conic-gradient(hsl(var(--primary) / 0.35) ${install.progress}%, transparent 0)`,
              }}>
              {Math.round(install.progress)}%
            </span>
          ) : (
            <button
              type='button'
              onClick={() => download(mod)}
              aria-label={`Download ${mod.name}`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "size-9 px-0",
              )}>
              <DownloadSimpleIcon />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
