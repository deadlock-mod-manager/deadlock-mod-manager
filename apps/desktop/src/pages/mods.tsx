import ErrorBoundary from '@/components/error-boundary';
import ModCard from '@/components/mod-card';
import PageTitle from '@/components/page-title';
import SearchBar from '@/components/seach-bar';
import { useSearch } from '@/hooks/use-search';
import { getMods } from '@/lib/api';
import { Suspense, useEffect } from 'react';
import { useQuery } from 'react-query';
import { toast } from 'sonner';

const GetModsData = () => {
  const { data, error } = useQuery('mods', getMods, { suspense: true });
  const { results, query, setQuery, sortType, setSortType } = useSearch({
    data: data ?? [],
    keys: ['name', 'description', 'author']
  });

  useEffect(() => {
    if (error) toast.error((error as Error)?.message ?? 'Failed to fetch mods. Try again later.');
  }, [error]);

  return (
    <div className="flex flex-col gap-4">
      <SearchBar query={query} setQuery={setQuery} sortType={sortType} setSortType={setSortType} />
      <div className="grid grid-cols-4 gap-4">
        {results.map((mod) => (
          <ModCard key={mod.id} mod={mod} />
        ))}
      </div>
    </div>
  );
};

const GetMods = () => {
  return (
    <div className="h-[calc(100vh-160px)] overflow-y-auto px-4 w-full scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin">
      <PageTitle className="mb-4" title="Mods" subtitle="Updated daily, with new mods added every week." />
      <Suspense
        fallback={
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 25 }).map((_, index) => (
              <ModCard key={index} mod={undefined} />
            ))}
          </div>
        }
      >
        <ErrorBoundary>
          <GetModsData />
        </ErrorBoundary>
      </Suspense>
    </div>
  );
};

export default GetMods;
