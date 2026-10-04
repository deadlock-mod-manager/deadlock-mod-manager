import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import ModCardSkeleton from "./mod-card";

export const AuthorPageSkeleton = () => (
  <div className='flex h-full min-h-0 w-full flex-col px-4'>
    <div className='mb-4 flex items-center pt-2'>
      <Skeleton className='h-8 w-36' />
    </div>

    <div className='min-h-0 flex-1 overflow-hidden pb-24'>
      <div className='mb-6 flex min-h-48 items-center gap-5 rounded-lg border bg-card p-6'>
        <Skeleton className='h-24 w-24 shrink-0 rounded-full' />
        <div className='flex flex-1 flex-col gap-3'>
          <Skeleton className='h-3.5 w-24' />
          <Skeleton className='h-8 w-56' />
          <div className='flex gap-2'>
            <Skeleton className='h-6 w-20 rounded-full' />
            <Skeleton className='h-6 w-24 rounded-full' />
            <Skeleton className='h-6 w-20 rounded-full' />
          </div>
        </div>
      </div>

      <div className='mb-4 flex items-baseline justify-between gap-4'>
        <Skeleton className='h-6 w-48' />
        <Skeleton className='h-4 w-16' />
      </div>

      <div className='grid grid-cols-1 gap-4 px-1 pr-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
        {Array.from({ length: 12 }, (_, index) => (
          <ModCardSkeleton key={index} />
        ))}
      </div>
    </div>
  </div>
);
