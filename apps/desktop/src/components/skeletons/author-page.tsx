import ModCardSkeleton from "./mod-card";

export const AuthorPageSkeleton = () => (
  <div className='flex h-full min-h-0 w-full flex-col px-4 pt-14'>
    <div className='mb-6 h-48 animate-pulse rounded-lg border bg-muted' />
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
      {Array.from({ length: 12 }, (_, index) => (
        <ModCardSkeleton key={index} />
      ))}
    </div>
  </div>
);
