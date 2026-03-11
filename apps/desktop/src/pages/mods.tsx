import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import ModCard from "@/components/mod-browsing/mod-card";
import SearchBar from "@/components/mod-browsing/search-bar";
import SearchBarSkeleton from "@/components/mod-browsing/search-bar-skeleton";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { useSearch } from "@/hooks/use-search";
import { getMods } from "@/lib/api";
import { ModCategory, TimePeriod } from "@/lib/constants";
import { STALE_TIME_API } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { getTimePeriodCutoff } from "@/lib/utils";
import type { FilterMode } from "@/lib/store/slices/ui";
import { isModOutdated } from "@/lib/utils";

const SEARCH_KEYS = ["name", "description", "author"];

const GetModsData = () => {
  const { t } = useTranslation();
  const { data, error } = useSuspenseQuery({
    queryKey: ["mods"],
    queryFn: getMods,
    staleTime: STALE_TIME_API,
    retry: 3,
  });
  const nsfwSettings = usePersistedStore((state) => state.nsfwSettings);
  const modsFilters = usePersistedStore((state) => state.modsFilters);
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );
  const {
    selectedCategories,
    selectedHeroes,
    hideAudio,
    hideNSFW,
    hideOutdated,
    timePeriod = TimePeriod.ALL_TIME,
    filterMode,
  } = modsFilters;
  // Defer the mod list so background refetches (staleTime expiry) don't
  // block the UI while Fuse.js rebuilds its index on 2600+ items.
  const deferredData = useDeferredValue(data ?? []);

  const { results, query, setQuery, sortType, setSortType } = useSearch({
    data: deferredData,
    keys: SEARCH_KEYS,
  });

  const { setScrollElement, scrollY } = useScrollPosition("/mods");

  const filteredResults = useMemo(() => {
    let filtered = results;

    // Filter by categories
    const predefinedCategorySet = new Set<string>(Object.values(ModCategory));

    if (selectedCategories.length > 0) {
      filtered = filtered.filter((mod) => {
        let matchesCategory = selectedCategories.includes(mod.category);

        if (
          !matchesCategory &&
          selectedCategories.includes(ModCategory.OTHER_MISC)
        ) {
          matchesCategory = !predefinedCategorySet.has(mod.category);
        }

        return filterMode === "include" ? matchesCategory : !matchesCategory;
      });
    }

    if (selectedHeroes.length > 0) {
      filtered = filtered.filter((mod) => {
        let matchesHero = false;

        if (selectedHeroes.includes("None")) {
          matchesHero =
            !mod.hero ||
            (mod.hero !== null && selectedHeroes.includes(mod.hero));
        } else {
          matchesHero = mod.hero !== null && selectedHeroes.includes(mod.hero);
        }

        return filterMode === "include" ? matchesHero : !matchesHero;
      });
    }

    if (nsfwSettings.hideNSFW || hideNSFW) {
      filtered = filtered.filter((mod) => !mod.isNSFW);
    }

    if (hideAudio) {
      filtered = filtered.filter((mod) => !mod.isAudio);
    }

    if (hideOutdated) {
      filtered = filtered.filter(
        (mod) => !mod.isObsolete && !isModOutdated(mod),
      );
    }

    const cutoff = getTimePeriodCutoff(timePeriod);
    if (cutoff) {
      const cutoffTime = cutoff.getTime();
      filtered = filtered.filter(
        (mod) => new Date(mod.remoteUpdatedAt).getTime() >= cutoffTime,
      );
    }

    return filtered;
  }, [
    results,
    selectedCategories,
    selectedHeroes,
    filterMode,
    nsfwSettings.hideNSFW,
    hideNSFW,
    hideAudio,
    hideOutdated,
    timePeriod,
  ]);

  const parentRef = useRef<HTMLDivElement>(null);
  const columnsPerRow = useResponsiveColumns();

  const modRows = useMemo(() => {
    const rows: (typeof filteredResults)[] = [];
    for (let i = 0; i < filteredResults.length; i += columnsPerRow) {
      rows.push(filteredResults.slice(i, i + columnsPerRow));
    }
    return rows;
  }, [filteredResults, columnsPerRow]);

  const rowVirtualizer = useVirtualizer({
    count: modRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 320 + 20,
    overscan: 3,
    initialOffset: scrollY,
  });

  useEffect(() => {
    if (parentRef.current) {
      setScrollElement(parentRef.current);
    }
  }, [setScrollElement]);

  useEffect(() => {
    if (error) {
      toast.error((error as Error)?.message ?? t("common.failedToFetchMods"));
    }
  }, [error, t]);

  const handleCategoriesChange = useCallback(
    (cats: string[]) => updateModsFilters({ selectedCategories: cats }),
    [updateModsFilters],
  );
  const handleFilterModeChange = useCallback(
    (mode: FilterMode) => updateModsFilters({ filterMode: mode }),
    [updateModsFilters],
  );
  const handleHeroesChange = useCallback(
    (heroes: string[]) => updateModsFilters({ selectedHeroes: heroes }),
    [updateModsFilters],
  );
  const handleHideAudioChange = useCallback(
    (hideAudio: boolean) => updateModsFilters({ hideAudio }),
    [updateModsFilters],
  );
  const handleHideNSFWChange = useCallback(
    (hideNSFW: boolean) => updateModsFilters({ hideNSFW }),
    [updateModsFilters],
  );
  const handleHideOutdatedChange = useCallback(
    (hideOutdated: boolean) => updateModsFilters({ hideOutdated }),
    [updateModsFilters],
  );

  const handleTimePeriodChange = useCallback(
    (timePeriod: TimePeriod) => updateModsFilters({ timePeriod }),
    [updateModsFilters],
  );

  return (
    <div className='flex flex-col gap-4'>
      <SearchBar
        filterMode={filterMode}
        mods={deferredData}
        timePeriod={timePeriod}
        onTimePeriodChange={handleTimePeriodChange}
        onCategoriesChange={handleCategoriesChange}
        onFilterModeChange={handleFilterModeChange}
        onHeroesChange={handleHeroesChange}
        onHideAudioChange={handleHideAudioChange}
        onHideNSFWChange={handleHideNSFWChange}
        onHideOutdatedChange={handleHideOutdatedChange}
        query={query}
        selectedCategories={selectedCategories}
        selectedHeroes={selectedHeroes}
        setQuery={setQuery}
        setSortType={setSortType}
        hideAudio={hideAudio}
        hideNSFW={hideNSFW}
        hideOutdated={hideOutdated}
        sortType={sortType}
      />
      {filteredResults.length === 0 ? (
        <Empty className='py-12'>
          <EmptyHeader>
            <EmptyMedia variant='default'>
              <MagnifyingGlass className='h-16 w-16' />
            </EmptyMedia>
            <EmptyTitle>{t("mods.noModsFound")}</EmptyTitle>
            <EmptyDescription>
              {query.trim() ||
              selectedCategories.length > 0 ||
              selectedHeroes.length > 0 ||
              hideAudio ||
              hideNSFW ||
              hideOutdated ||
              timePeriod !== TimePeriod.ALL_TIME
                ? t("mods.noModsMatchFilters")
                : t("mods.noModsAvailable")}
            </EmptyDescription>
            {(selectedCategories.length > 0 ||
              selectedHeroes.length > 0 ||
              hideAudio ||
              hideNSFW ||
              hideOutdated ||
              timePeriod !== TimePeriod.ALL_TIME) && (
              <EmptyDescription className='text-xs'>
                {t("mods.emptyClearFilters")}
              </EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          className='h-[calc(100vh-280px)] overflow-auto will-change-transform'
          ref={parentRef} // Dynamic height for virtualization accounting for title + search bar
          // will-change: transform forces WebKit to allocate a dedicated compositing
          // layer for this scroll container. Without it, webkit2gtk on Linux doesn't
          // properly track damage regions for the absolutely-positioned virtualizer
          // children (position:absolute + translateY), causing blank tiles on scroll.
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  contain: "strict",
                  contentVisibility: "auto",
                  containIntrinsicSize: `auto ${virtualRow.size}px`,
                }}>
                <div className='grid grid-cols-1 gap-4 px-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
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
  const { t } = useTranslation();

  return (
    <div className='w-full px-4'>
      <PageTitle
        className='mb-8'
        subtitle={t("mods.subtitle")}
        title={t("navigation.getMods")}
      />
      <Suspense
        fallback={
          <div className='flex flex-col gap-4'>
            <SearchBarSkeleton />
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
              {Array.from({ length: 25 }, (_, i) => (
                <ModCard key={i} mod={undefined} />
              ))}
            </div>
          </div>
        }>
        <ErrorBoundary>
          <GetModsData />
        </ErrorBoundary>
      </Suspense>
    </div>
  );
};

export default GetMods;
