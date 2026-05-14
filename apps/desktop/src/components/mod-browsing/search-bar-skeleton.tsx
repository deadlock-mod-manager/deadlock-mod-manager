import { Skeleton } from "@deadlock-mods/ui/components/skeleton";

const SearchBarSkeleton = () => {
  return (
    <div className='flex items-center justify-between gap-4'>
      <div className='flex items-center gap-3'>
        <Skeleton className='h-10 w-80' />
        <Skeleton className='h-10 w-20' />
      </div>
      <div className='flex items-center gap-4'>
        <Skeleton className='h-10 w-32' />
        <Skeleton className='h-10 w-36' />
      </div>
    </div>
  );
};

export default SearchBarSkeleton;
