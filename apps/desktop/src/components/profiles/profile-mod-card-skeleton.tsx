import { Skeleton } from "@deadlock-mods/ui/components/skeleton";

export const ProfileModCardSkeleton = () => (
  <div className='flex items-center justify-between rounded-lg border p-3'>
    <div className='flex items-center gap-3'>
      <Skeleton className='h-10 w-10 rounded' />
      <div className='space-y-1'>
        <Skeleton className='h-4 w-32' />
        <Skeleton className='h-3 w-20' />
      </div>
    </div>

    <Skeleton className='h-5 w-16 rounded-full' />
  </div>
);
