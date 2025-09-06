import type { ModDto } from '@deadlock-mods/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useQuery } from 'react-query';
import { toast } from 'sonner';
import ErrorBoundary from '@/components/error-boundary';
import ModCard from '@/components/mod-card';
import PageTitle from '@/components/page-title';
import SearchBar from '@/components/search-bar';
import SearchBarSkeleton from '@/components/search-bar-skeleton';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { useSearch } from '@/hooks/use-search';
import { getMods } from '@/lib/api';
import { ModCategory } from '@/lib/constants';
import { usePersistedStore } from '@/lib/store';
import { isModOutdated } from '@/lib/utils';

const GetModsData = () => {
  const { data, error } = useQuery('mods', getMods, { suspense: true });
  const [hideOutdated, setHideOutdated] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedHeroes, setSelectedHeroes] = useState<string[]>([]);
  const [showAudioOnly, setShowAudioOnly] = useState(false);
  const { nsfwSettings, updateNSFWSettings } = usePersistedStore();
  const { results, query, setQuery, sortType, setSortType } = useSearch({
    data: data ?? [],
    keys: ['name', 'description', 'author'],
  });

  // Initialize scroll position management
  const { setScrollElement, scrollY } = useScrollPosition('/mods');

  // Apply all filters
  let filteredResults = results;

  // Filter out outdated mods if hideOutdated is enabled
  if (hideOutdated) {
    filteredResults = filteredResults.filter((mod) => !isModOutdated(mod));
  }

  // Filter by categories
  if (selectedCategories.length > 0) {
    filteredResults = filteredResults.filter((mod) => {
      // Check if mod category is in selected categories
      if (selectedCategories.includes(mod.category)) {
        return true;
      }

      // If OTHER_MISC is selected, include mods with non-predefined categories
      if (selectedCategories.includes(ModCategory.OTHER_MISC)) {
        const predefinedCategories = Object.values(ModCategory);
        return !predefinedCategories.includes(mod.category as ModCategory);
      }

      return false;
    });
  }

  // Filter by heroes
  if (selectedHeroes.length > 0) {
    filteredResults = filteredResults.filter((mod) => {
      if (selectedHeroes.includes('None')) {
        // Include mods without heroes and mods with selected heroes
        return !mod.hero || selectedHeroes.includes(mod.hero);
      }
      return mod.hero && selectedHeroes.includes(mod.hero);
    });
  }

  // Filter NSFW mods based on global privacy settings
  if (nsfwSettings.hideNSFW) {
    filteredResults = filteredResults.filter((mod) => !mod.isNSFW);
  }

  // Filter by audio mods only if enabled
  if (showAudioOnly) {
    filteredResults = filteredResults.filter((mod) => mod.isAudio);
  }

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
    estimateSize: () => 320 + 20, // Estimated height of ModCard + gap (updated for better spacing)
    overscan: 2, // Render 2 extra rows above and below visible area
    // Use saved scroll position as initial offset - this is the key to smooth restoration!
    initialOffset: scrollY,
  });

  // Set scroll element for position tracking
  useEffect(() => {
    if (parentRef.current) {
      setScrollElement(parentRef.current);
    }
  }, [setScrollElement]);

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
        mods={data ?? []}
        onCategoriesChange={setSelectedCategories}
        onHeroesChange={setSelectedHeroes}
        onHideOutdatedChange={setHideOutdated}
        onShowAudioOnlyChange={setShowAudioOnly}
        onShowNSFWChange={(show) => updateNSFWSettings({ hideNSFW: !show })}
        query={query}
        selectedCategories={selectedCategories}
        selectedHeroes={selectedHeroes}
        setQuery={setQuery}
        setSortType={setSortType}
        showAudioOnly={showAudioOnly}
        showNSFW={!nsfwSettings.hideNSFW}
        sortType={sortType}
      />
      {filteredResults.length === 0 ? (
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
            {query.trim() ||
            selectedCategories.length > 0 ||
            selectedHeroes.length > 0 ||
            !nsfwSettings.hideNSFW ||
            hideOutdated ||
            showAudioOnly
              ? 'No mods match your current search and filters'
              : 'No mods available'}
          </p>
          {(selectedCategories.length > 0 ||
            selectedHeroes.length > 0 ||
            !nsfwSettings.hideNSFW ||
            hideOutdated ||
            showAudioOnly) && (
            <p className="mt-2 text-muted-foreground text-xs">
              Try clearing some filters to see more results
            </p>
          )}
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
          <div className="flex flex-col gap-4">
            <SearchBarSkeleton />
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 25 }, () => (
                <ModCard key={crypto.randomUUID()} mod={undefined} />
              ))}
            </div>
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
