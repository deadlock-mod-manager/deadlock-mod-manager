import type { AnnouncementDto } from "@deadlock-mods/shared";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  CaretLeftIcon,
  CaretRightIcon,
  MegaphoneIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAnnouncements } from "@/lib/api";
import { STALE_TIME_API } from "@/lib/query-constants";
import { cn } from "@/lib/utils";
import { AnnouncementDetailDialog } from "./announcement-detail-dialog";
import { getAnnouncementDate, getCategoryConfig } from "./announcement-utils";

const TICKER_GLYPH = "✦";

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);
  return reduced;
};

const TickerItem = ({
  announcement,
  onSelect,
}: {
  announcement: AnnouncementDto;
  onSelect: (a: AnnouncementDto) => void;
}) => {
  const { icon: Icon, label } = getCategoryConfig(announcement.category);
  const date = getAnnouncementDate(announcement);

  return (
    <button
      className='group/item inline-flex shrink-0 items-center gap-2 px-1 py-1 text-left transition-colors'
      onClick={() => onSelect(announcement)}
      type='button'>
      <Icon className='size-3.5 shrink-0 text-primary/80' weight='duotone' />
      <span className='font-bold text-[10px] text-primary/80 uppercase tracking-[0.25em]'>
        {label}
      </span>
      <span className='font-medium text-foreground/90 text-sm group-hover/item:text-primary'>
        {announcement.title}
      </span>
      <span className='font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider'>
        {formatDistanceToNow(date, { addSuffix: true })}
      </span>
    </button>
  );
};

const TickerTrack = ({
  announcements,
  onSelect,
  ariaHidden,
}: {
  announcements: AnnouncementDto[];
  onSelect: (a: AnnouncementDto) => void;
  ariaHidden?: boolean;
}) => (
  <div
    aria-hidden={ariaHidden}
    className='flex shrink-0 items-center gap-8 pr-8'>
    {announcements.map((announcement) => (
      <div
        className='inline-flex shrink-0 items-center gap-8'
        key={`${ariaHidden ? "dup" : "src"}-${announcement.id}`}>
        <TickerItem announcement={announcement} onSelect={onSelect} />
        <span
          aria-hidden='true'
          className='select-none text-primary/40 text-xs'>
          {TICKER_GLYPH}
        </span>
      </div>
    ))}
  </div>
);

const StaticTicker = ({
  announcements,
  onSelect,
}: {
  announcements: AnnouncementDto[];
  onSelect: (a: AnnouncementDto) => void;
}) => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const total = announcements.length;
  const current = announcements[index];

  if (!current) return null;

  return (
    <div className='flex flex-1 items-center gap-2'>
      <button
        aria-label={t("dashboard.tickerPrev")}
        className='shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary'
        onClick={() => setIndex((i) => (i - 1 + total) % total)}
        type='button'>
        <CaretLeftIcon className='size-3.5' weight='bold' />
      </button>
      <div className='flex-1 overflow-hidden'>
        <TickerItem announcement={current} onSelect={onSelect} />
      </div>
      <span className='shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums'>
        {index + 1}/{total}
      </span>
      <button
        aria-label={t("dashboard.tickerNext")}
        className='shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary'
        onClick={() => setIndex((i) => (i + 1) % total)}
        type='button'>
        <CaretRightIcon className='size-3.5' weight='bold' />
      </button>
    </div>
  );
};

const TickerSkeleton = () => (
  <div className='flex flex-1 items-center gap-6 overflow-hidden'>
    <Skeleton className='h-3 w-48' />
    <Skeleton className='h-3 w-64' />
    <Skeleton className='h-3 w-40' />
  </div>
);

export const AnnouncementsTicker = () => {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const [selected, setSelected] = useState<AnnouncementDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: getAnnouncements,
    staleTime: STALE_TIME_API,
    refetchOnWindowFocus: false,
  });

  const announcements = useMemo(() => data ?? [], [data]);

  // When loading, we still render the eyebrow so the layout doesn't jump.
  // When loaded with zero announcements, the entire ticker is hidden.
  if (!isLoading && announcements.length === 0) {
    return null;
  }

  return (
    <>
      <div
        aria-label={t("dashboard.broadcast")}
        className={cn(
          "relative flex h-9 w-full items-center gap-3 overflow-hidden",
          "border-y border-primary/20 bg-card/40",
        )}
        role='region'>
        <div className='flex shrink-0 items-center gap-2 border-primary/20 border-r bg-background/60 px-3 py-1.5'>
          <MegaphoneIcon className='size-4 text-primary' weight='duotone' />
          <span
            className='font-bold text-[10px] text-primary uppercase tracking-[0.4em]'
            style={{ fontFamily: '"Forevs Demo", serif' }}>
            {t("dashboard.broadcast")}
          </span>
        </div>

        <div className='relative flex flex-1 items-center overflow-hidden'>
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-card/70 to-transparent'
          />
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-card/70 to-transparent'
          />

          {isLoading ? (
            <div className='px-2'>
              <TickerSkeleton />
            </div>
          ) : reducedMotion ? (
            <div className='px-2'>
              <StaticTicker
                announcements={announcements}
                onSelect={setSelected}
              />
            </div>
          ) : (
            <div className='flex w-full items-center overflow-hidden'>
              <div className='flex w-max animate-ticker items-center'>
                <TickerTrack
                  announcements={announcements}
                  onSelect={setSelected}
                />
                <TickerTrack
                  announcements={announcements}
                  ariaHidden
                  onSelect={setSelected}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <AnnouncementDetailDialog
        announcement={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
};
