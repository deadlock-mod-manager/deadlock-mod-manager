import ModCard from "@/components/mod-browsing/mod-card";
import SearchBarSkeleton from "@/components/mod-browsing/search-bar-skeleton";

export const ModsPageSkeleton = () => (
  <div className='flex min-h-0 flex-1 flex-col gap-4'>
    <SearchBarSkeleton />
    <div className='min-h-0 flex-1 overflow-hidden'>
      <div className='grid grid-cols-1 gap-4 px-1 pr-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
        {Array.from({ length: 25 }, (_, i) => (
          <ModCard key={i} mod={undefined} />
        ))}
      </div>
    </div>
  </div>
);
