import type { ModDto } from '@deadlock-mods/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Suspense, useEffect, useRef, useState } from 'react';
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
  const [hideOutdated, setHideOutdated] = useState(true);
  const { results, query, setQuery, sortType, setSortType } = useSearch({
    data: data ?? [],
    keys: ['name', 'description', 'author'],
  });

  // Filter out outdated mods if hideOutdated is enabled
  const filteredResults = hideOutdated
    ? results.filter((mod) => !isModOutdated(mod))
    : results;

  // Group mods into rows of 4 for virtualization
  const COLUMNS_PER_ROW = 4;
  const modRows: ModDto[][] = [];
  for (let i = 0; i < filteredResults.length; i += COLUMNS_PER_ROW) {
    modRows.push(filteredResults.slice(i, i + COLUMNS_PER_ROW));
  }

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: modRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 300, // Estimated height of ModCard + gap
    overscan: 2, // Render 2 extra rows above and below visible area
  });

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
        <div
          className="scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin h-[calc(100vh-280px)] overflow-auto"
          ref={parentRef} // Dynamic height for virtualization accounting for title + search bar
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="grid grid-cols-4 gap-4 px-1">
                  {modRows[virtualRow.index]?.map((mod) => (
                    <ModCard key={mod.id} mod={mod} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const GetMods = () => {
  return (
    <div className="h-[calc(100vh-160px)] w-full px-4">
      <PageTitle
        className="mb-4"
        subtitle="Updated daily, with new mods added every week."
        title="Mods"
      />
      <Suspense
        fallback={
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 25 }, () => (
              <ModCard key={crypto.randomUUID()} mod={undefined} />
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
