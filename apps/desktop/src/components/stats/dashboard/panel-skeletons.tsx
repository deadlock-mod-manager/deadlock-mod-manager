import { Card } from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import type { ReactNode } from "react";
import { StatTileSkeleton } from "@/components/stats/stat-tile";
import { cn } from "@/lib/utils";

/**
 * Loading stand-ins shaped like each panel's cards, so the page keeps its
 * layout while match history loads instead of jumping when it lands.
 */

const Shell = ({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) => (
  <Card
    aria-hidden
    className={cn(
      "stats-surface flex h-full flex-col gap-5 p-6 shadow-none",
      className,
    )}>
    <div className='flex flex-col gap-2'>
      <Skeleton className='h-4 w-36' />
      <Skeleton className='h-3 w-60 max-w-full' />
    </div>
    {children ?? <Skeleton className='min-h-0 w-full flex-1 rounded-lg' />}
  </Card>
);

const Rows = ({ count, className }: { count: number; className?: string }) => (
  <div className='flex flex-col gap-3'>
    {Array.from({ length: count }, (_, index) => (
      <div className='flex items-center gap-3' key={index}>
        <Skeleton className='h-9 w-9 shrink-0 rounded-lg' />
        <Skeleton className={cn("h-3.5 flex-1", className)} />
        <Skeleton className='h-3.5 w-12 shrink-0' />
      </div>
    ))}
  </div>
);

const TableCard = ({ rows }: { rows: number }) => (
  <Card
    aria-hidden
    className='stats-surface flex flex-col overflow-hidden shadow-none'>
    <div className='flex flex-col gap-2 px-6 pt-5 pb-4'>
      <Skeleton className='h-4 w-32' />
      <Skeleton className='h-3 w-56' />
    </div>
    <div className='border-border/60 border-y px-6 py-3'>
      <Skeleton className='h-2.5 w-full max-w-xl' />
    </div>
    {Array.from({ length: rows }, (_, index) => (
      <div
        className='flex h-[57px] items-center gap-4 border-border/40 border-b px-6 last:border-b-0'
        key={index}>
        <Skeleton className='h-9 w-9 shrink-0 rounded-lg' />
        <Skeleton className='h-3.5 w-28' />
        <Skeleton className='h-1.5 w-36' />
        <div className='flex-1' />
        <Skeleton className='h-3.5 w-12' />
        <Skeleton className='h-3.5 w-12' />
        <Skeleton className='h-3.5 w-16' />
      </div>
    ))}
  </Card>
);

export const ProfileSkeleton = () => (
  <Card
    aria-hidden
    className='stats-surface flex h-full flex-col gap-5 p-5 shadow-none'>
    <div className='flex items-center gap-3'>
      <Skeleton className='h-[52px] w-[52px] shrink-0 rounded-full' />
      <div className='flex flex-1 flex-col gap-2'>
        <Skeleton className='h-4 w-28' />
        <Skeleton className='h-3 w-36' />
      </div>
    </div>
    <div className='flex flex-col gap-2'>
      <Skeleton className='h-4 w-24' />
      <Skeleton className='h-3 w-48 max-w-full' />
    </div>
    <Skeleton className='h-[54px] w-full' />
    <div className='mt-auto flex flex-col gap-3'>
      {Array.from({ length: 4 }, (_, index) => (
        <div className='flex justify-between' key={index}>
          <Skeleton className='h-3 w-20' />
          <Skeleton className='h-3 w-10' />
        </div>
      ))}
    </div>
  </Card>
);

export const TrendsSkeleton = () => (
  <Card
    aria-hidden
    className='stats-surface grid h-[150px] grid-cols-1 overflow-hidden shadow-none sm:grid-cols-2 xl:grid-cols-[minmax(260px,1.3fr)_repeat(4,minmax(0,1fr))]'>
    <div className='flex items-center gap-4 p-5'>
      <Skeleton className='h-[84px] w-[84px] shrink-0 rounded-full' />
      <div className='flex flex-1 flex-col gap-2'>
        <Skeleton className='h-3 w-24' />
        <Skeleton className='h-[22px] w-full' />
      </div>
    </div>
    {Array.from({ length: 4 }, (_, index) => (
      <div
        className='hidden flex-col gap-3 border-border/70 border-l p-5 xl:flex'
        key={index}>
        <Skeleton className='h-3 w-16' />
        <Skeleton className='h-6 w-20' />
        <Skeleton className='h-[34px] w-full' />
      </div>
    ))}
  </Card>
);

export const TilesSkeleton = () => (
  <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
    {Array.from({ length: 5 }, (_, index) => (
      <StatTileSkeleton key={index} />
    ))}
  </div>
);

export const HeroesSkeleton = () => (
  <div className='flex flex-col gap-4 pb-8'>
    <div className='grid gap-4 xl:grid-cols-[1fr_380px]'>
      <Shell className='h-[430px]' />
      <Shell className='h-[430px]'>
        <Rows count={7} />
      </Shell>
    </div>
    <TableCard rows={6} />
  </div>
);

export const ItemsSkeleton = () => (
  <div className='grid gap-4 pb-8 xl:grid-cols-[1fr_320px]'>
    <TableCard rows={8} />
    <div className='flex flex-col gap-4'>
      <Shell className='h-[200px]' />
      <Shell className='h-[200px]' />
    </div>
  </div>
);

export const SquadSkeleton = () => (
  <div className='flex flex-col gap-2'>
    <Skeleton className='h-3 w-64' />
    <div className='flex flex-col gap-4 pb-8'>
      <div className='grid gap-4 xl:grid-cols-[1fr_340px]'>
        <Shell className='h-[360px]'>
          <Rows count={6} />
        </Shell>
        <div className='flex flex-col gap-4'>
          <Shell className='h-[172px]' />
          <Shell className='h-[172px]' />
        </div>
      </div>
      <TableCard rows={5} />
    </div>
  </div>
);

export const ChartSkeleton = () => <Shell />;

export const RankSkeleton = () => <Shell className='h-[300px]' />;

export const InsightsSkeleton = () => (
  <Shell className='h-[260px]'>
    <Rows count={4} />
  </Shell>
);

export const ListSkeleton = ({ rows }: { rows: number }) => (
  <Shell>
    <Rows count={rows} />
  </Shell>
);
