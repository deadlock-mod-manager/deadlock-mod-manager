import { Suspense, useEffect, useState } from 'react';
import { useQuery } from 'react-query';
import { toast } from 'sonner';
import ErrorBoundary from '@/components/error-boundary';
import ModCard from '@/components/mod-card';
import PageTitle from '@/components/page-title';
import SearchBar from '@/components/search-bar';
import { useSearch } from '@/hooks/use-search';
import { getMods } from '@/lib/api';
import { isModOutdated } from '@/lib/utils';

const GetModsData = () => {
  const { data, error } = useQuery('mods', getMods, { suspense: true });
  const [hideOutdated, setHideOutdated] = useState(false);
  const { results, query, setQuery, sortType, setSortType } = useSearch({
    data: data ?? [],
    keys: ['name', 'description', 'author'],
  });

  // Filter out outdated mods if hideOutdated is enabled
  const filteredResults = hideOutdated
    ? results.filter((mod) => !isModOutdated(mod))
    : results;

  useEffect(() => {
    if (error) {
      toast.error(
        (error as Error)?.message ?? 'Failed to fetch mods. Try again later.'
      );
    }
  }, [error]);

  return (
    <div className="flex flex-col gap-4">
      <SearchBar
        hideOutdated={hideOutdated}
        query={query}
        setHideOutdated={setHideOutdated}
        setQuery={setQuery}
        setSortType={setSortType}
        sortType={sortType}
      />
      {filteredResults.length === 0 && query.trim() ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-2 text-muted-foreground">
            <svg
              className="mx-auto mb-4 h-12 w-12"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3 className="mb-1 font-medium text-lg">No mods found</h3>
          <p className="text-muted-foreground text-sm">
            No mods match your search for "{query}"
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {filteredResults.map((mod) => (
            <ModCard key={mod.id} mod={mod} />
          ))}
        </div>
      )}
    </div>
  );
};

const GetMods = () => {
  return (
    <div className="scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin h-[calc(100vh-160px)] w-full overflow-y-auto px-4">
      <PageTitle
        className="mb-4"
        subtitle="Updated daily, with new mods added every week."
        title="Mods"
      />
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
