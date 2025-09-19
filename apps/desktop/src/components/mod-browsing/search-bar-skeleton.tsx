import { Skeleton } from "@/components/ui/skeleton";

const SearchBarSkeleton = () => {
  return (
    <div className='flex flex-col gap-3'>
      {/* Main search bar row */}
      <div className='flex items-center justify-between gap-4'>
        <div className='flex items-center gap-3'>
          {/* Search input skeleton */}
          <Skeleton className='h-10 w-80' />
          {/* Filters dropdown skeleton */}
          <Skeleton className='h-10 w-20' />
        </div>
        <div className='flex items-center gap-4'>
          {/* Sort dropdown skeleton */}
          <Skeleton className='h-10 w-36' />
          {/* Hide outdated toggle skeleton */}
          <div className='flex items-center gap-2'>
            <Skeleton className='h-5 w-9' />
            <Skeleton className='h-4 w-24' />
          </div>
        </div>
      </div>

      {/* Active filters placeholder (shown rarely, so smaller) */}
      <div className='flex items-center gap-2'>
        <Skeleton className='h-4 w-20' />
        <Skeleton className='h-6 w-16' />
        <Skeleton className='h-6 w-20' />
        <Skeleton className='h-4 w-12' />
      </div>
    </div>
  );
};

export default SearchBarSkeleton;
