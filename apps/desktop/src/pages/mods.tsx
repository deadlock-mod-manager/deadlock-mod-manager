import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@deadlock-mods/ui/components/pagination";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { platform } from "@tauri-apps/plugin-os";
import { useTranslation } from "react-i18next";
import ModCard from "@/components/mod-browsing/mod-card";
import SearchBar from "@/components/mod-browsing/search-bar";
import SearchBarSkeleton from "@/components/mod-browsing/search-bar-skeleton";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { useSearch } from "@/hooks/use-search";
import { getMods } from "@/lib/api";
import { ModCategory, TimePeriod } from "@/lib/constants";
import { STALE_TIME_API } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { getTimePeriodCutoff } from "@/lib/utils";
import type {
  AudioQuickFilter,
  FilterMode,
  MapQuickFilter,
} from "@/lib/store/slices/ui";
import { cn, isModOutdated } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "@deadlock-mods/ui/icons";

const SEARCH_KEYS = ["name", "description", "author"];
const PAGE_SIZE = 50;
const MODS_STORE_PAGE_KEY = "/mods:page";
const MAPS_STORE_PAGE_KEY = "/maps:page";
const MODS_STORE_PAGINATION_SETTING_ID = "mods-store-pagination";
const MOD_ROW_ESTIMATED_HEIGHT = 340;

function ModsPagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Pagination className={className}>
      <PaginationContent>
        <PaginationItem>
          <PaginationLink
            aria-label={t("pagination.previous")}
            aria-disabled={page === 0}
            className={cn(
              "gap-1 pl-2.5",
              page === 0 ? "pointer-events-none opacity-50" : "",
            )}
            size='default'
            onClick={(e) => {
              e.preventDefault();
              if (page > 0) onPageChange(page - 1);
            }}>
            <ChevronLeft className='h-4 w-4' />
            <span>{t("pagination.previous")}</span>
          </PaginationLink>
        </PaginationItem>
        {Array.from({ length: totalPages }, (_, i) => i)
          .filter((i) => {
            if (totalPages <= 7) return true;
            if (i === 0 || i === totalPages - 1) return true;
            return Math.abs(i - page) <= 2;
          })
          .reduce<(number | "ellipsis")[]>((acc, i, idx, arr) => {
            if (idx > 0 && arr[idx - 1] < i - 1) acc.push("ellipsis");
            acc.push(i);
            return acc;
          }, [])
          .map((item, idx) =>
            item === "ellipsis" ? (
              <PaginationItem key={`ellipsis-${idx}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink
                  isActive={item === page}
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange(item);
                  }}>
                  {item + 1}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
        <PaginationItem>
          <PaginationLink
            aria-label={t("pagination.next")}
            aria-disabled={page === totalPages - 1}
            className={cn(
              "gap-1 pr-2.5",
              page === totalPages - 1 ? "pointer-events-none opacity-50" : "",
            )}
            size='default'
            onClick={(e) => {
              e.preventDefault();
              if (page < totalPages - 1) onPageChange(page + 1);
            }}>
            <span>{t("pagination.next")}</span>
            <ChevronRight className='h-4 w-4' />
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

const GetModsData = ({ mapsOnly }: { mapsOnly?: boolean }) => {
  const { t } = useTranslation();
  const { isEnabled: isCustomMapsEnabled } = useFeatureFlag(
    "custom-maps",
    false,
  );
  const { data, error } = useSuspenseQuery({
    queryKey: ["mods"],
    queryFn: getMods,
    staleTime: STALE_TIME_API,
    retry: 3,
  });
  const nsfwSettings = usePersistedStore((state) => state.nsfwSettings);
  const modsFilters = usePersistedStore((state) => state.modsFilters);
  const modsStorePaginationEnabled = usePersistedStore(
    (state) => state.settings[MODS_STORE_PAGINATION_SETTING_ID]?.enabled,
  );
  const getPersistedPage = usePersistedStore(
    (state) => state.getScrollPosition,
  );
  const setPersistedPage = usePersistedStore(
    (state) => state.setScrollPosition,
  );
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );
  const {
    selectedCategories,
    selectedHeroes,
    audioQuickFilter,
    hideNSFW,
    hideOutdated,
    timePeriod = TimePeriod.ALL_TIME,
    filterMode,
  } = modsFilters;
  const effectiveMapQuickFilter: MapQuickFilter = mapsOnly
    ? "only"
    : isCustomMapsEnabled
      ? modsFilters.mapQuickFilter
      : "off";
  const pageKey = mapsOnly ? MAPS_STORE_PAGE_KEY : MODS_STORE_PAGE_KEY;
  const scrollKey = mapsOnly ? "/maps" : "/mods";
  const paginationEnabled =
    modsStorePaginationEnabled ?? platform() === "linux";
  const [page, setPage] = useState(() => getPersistedPage(pageKey));
  const parentRef = useRef<HTMLDivElement>(null);
  const previousFilterSignatureRef = useRef<string | null>(null);
  // Defer the mod list so background refetches (staleTime expiry) don't
  // block the UI while Fuse.js rebuilds its index on 2600+ items.
  const deferredData = useDeferredValue(data ?? []);
  const { restoreScrollPosition, setScrollElement, scrollY } =
    useScrollPosition(scrollKey);
  const columnsPerRow = useResponsiveColumns();

  useEffect(() => {
    if (!parentRef.current) return;

    setScrollElement(parentRef.current);
    if (paginationEnabled) {
      restoreScrollPosition();
    }
  }, [paginationEnabled, restoreScrollPosition, setScrollElement]);
  const { results, query, setQuery, sortType, setSortType } = useSearch({
    data: deferredData,
    keys: SEARCH_KEYS,
  });
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

    if (audioQuickFilter === "only") {
      filtered = filtered.filter((mod) => mod.isAudio);
    } else if (audioQuickFilter === "exclude") {
      filtered = filtered.filter((mod) => !mod.isAudio);
    }

    if (effectiveMapQuickFilter === "only") {
      filtered = filtered.filter((mod) => mod.isMap);
    } else if (effectiveMapQuickFilter === "exclude") {
      filtered = filtered.filter((mod) => !mod.isMap);
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
    audioQuickFilter,
    effectiveMapQuickFilter,
    hideOutdated,
    timePeriod,
  ]);

  const totalPages = paginationEnabled
    ? Math.ceil(filteredResults.length / PAGE_SIZE)
    : 1;
  const displayedMods = useMemo(
    () =>
      paginationEnabled
        ? filteredResults.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        : filteredResults,
    [filteredResults, page, paginationEnabled],
  );
  const modRows = useMemo(() => {
    if (paginationEnabled) {
      return [] as (typeof filteredResults)[];
    }

    const rows: (typeof filteredResults)[] = [];
    for (let i = 0; i < filteredResults.length; i += columnsPerRow) {
      rows.push(filteredResults.slice(i, i + columnsPerRow));
    }
    return rows;
  }, [columnsPerRow, filteredResults, paginationEnabled]);
  const rowVirtualizer = useVirtualizer({
    count: modRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => MOD_ROW_ESTIMATED_HEIGHT,
    overscan: 3,
    initialOffset: scrollY,
  });
  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        filterMode,
        audioQuickFilter,
        mapQuickFilter: effectiveMapQuickFilter,
        hideNSFW,
        hideOutdated,
        query,
        selectedCategories,
        selectedHeroes,
        timePeriod,
      }),
    [
      filterMode,
      audioQuickFilter,
      effectiveMapQuickFilter,
      hideNSFW,
      hideOutdated,
      query,
      selectedCategories,
      selectedHeroes,
      timePeriod,
    ],
  );

  useEffect(() => {
    const maxPage = Math.max(totalPages - 1, 0);
    setPage((currentPage) => {
      const nextPage = Math.min(currentPage, maxPage);

      if (nextPage !== currentPage) {
        setPersistedPage(pageKey, nextPage);
      }

      return nextPage;
    });
  }, [pageKey, setPersistedPage, totalPages]);

  useEffect(() => {
    if (previousFilterSignatureRef.current === null) {
      previousFilterSignatureRef.current = filterSignature;
      return;
    }

    if (previousFilterSignatureRef.current === filterSignature) {
      return;
    }

    previousFilterSignatureRef.current = filterSignature;

    setPage(0);
    setPersistedPage(pageKey, 0);
    if (parentRef.current) {
      parentRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [filterSignature, pageKey, setPersistedPage]);

  useEffect(() => {
    if (error) {
      toast.error((error as Error)?.message ?? t("common.failedToFetchMods"));
    }
  }, [error, t]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      setPersistedPage(pageKey, newPage);
      if (parentRef.current) {
        parentRef.current.scrollTo({ top: 0, behavior: "auto" });
      }
    },
    [pageKey, setPersistedPage],
  );

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
  const handleAudioQuickFilterChange = useCallback(
    (value: AudioQuickFilter) => updateModsFilters({ audioQuickFilter: value }),
    [updateModsFilters],
  );
  const handleMapQuickFilterChange = useCallback(
    (value: MapQuickFilter) => updateModsFilters({ mapQuickFilter: value }),
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
        onAudioQuickFilterChange={handleAudioQuickFilterChange}
        onMapQuickFilterChange={handleMapQuickFilterChange}
        onHideNSFWChange={handleHideNSFWChange}
        onHideOutdatedChange={handleHideOutdatedChange}
        query={query}
        selectedCategories={selectedCategories}
        selectedHeroes={selectedHeroes}
        setQuery={setQuery}
        setSortType={setSortType}
        audioQuickFilter={audioQuickFilter}
        mapQuickFilter={effectiveMapQuickFilter}
        hideNSFW={hideNSFW}
        hideOutdated={hideOutdated}
        sortType={sortType}
        hideMapFilter={mapsOnly || !isCustomMapsEnabled}
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
              audioQuickFilter !== "off" ||
              effectiveMapQuickFilter !== "off" ||
              hideNSFW ||
              hideOutdated ||
              timePeriod !== TimePeriod.ALL_TIME
                ? t("mods.noModsMatchFilters")
                : t("mods.noModsAvailable")}
            </EmptyDescription>
            {(selectedCategories.length > 0 ||
              selectedHeroes.length > 0 ||
              audioQuickFilter !== "off" ||
              effectiveMapQuickFilter !== "off" ||
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
        <div className='h-[calc(100vh-280px)] overflow-auto' ref={parentRef}>
          {paginationEnabled ? (
            <div className='flex flex-col gap-4 px-1 pb-24 pr-2'>
              {totalPages > 1 && (
                <ModsPagination
                  className='mb-4'
                  onPageChange={handlePageChange}
                  page={page}
                  totalPages={totalPages}
                />
              )}
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
                {displayedMods.map((mod) => (
                  <ModCard key={mod.id} mod={mod} />
                ))}
              </div>
              {totalPages > 1 && (
                <ModsPagination
                  className='mt-6 pb-12'
                  onPageChange={handlePageChange}
                  page={page}
                  totalPages={totalPages}
                />
              )}
            </div>
          ) : (
            <div
              className='will-change-transform'
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
                width: "100%",
              }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  style={{
                    contain: "strict",
                    containIntrinsicSize: `auto ${virtualRow.size}px`,
                    contentVisibility: "auto",
                    height: `${virtualRow.size}px`,
                    left: 0,
                    position: "absolute",
                    top: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                    width: "100%",
                  }}>
                  <div className='grid grid-cols-1 gap-4 px-1 pr-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
                    {modRows[virtualRow.index]?.map((mod) => (
                      <ModCard key={mod.id} mod={mod} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ModsPageSkeleton = () => (
  <div className='flex flex-col gap-4'>
    <SearchBarSkeleton />
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
      {Array.from({ length: 25 }, (_, i) => (
        <ModCard key={i} mod={undefined} />
      ))}
    </div>
  </div>
);

const GetMods = () => {
  const { t } = useTranslation();

  return (
    <div className='w-full px-4'>
      <PageTitle
        className='mb-8'
        subtitle={t("mods.subtitle")}
        title={t("navigation.getMods")}
      />
      <Suspense fallback={<ModsPageSkeleton />}>
        <ErrorBoundary>
          <GetModsData />
        </ErrorBoundary>
      </Suspense>
    </div>
  );
};

export const GetMaps = () => {
  const { t } = useTranslation();

  return (
    <div className='w-full px-4'>
      <PageTitle
        className='mb-4'
        subtitle={t("mods.mapsSubtitle")}
        title={t("navigation.maps")}
      />
      <Alert
        className='mb-6 gap-3.5 rounded-xl border-amber-200/80 bg-amber-50/90 py-4 pl-4 pr-5 shadow-sm ring-1 ring-inset ring-amber-200/60 items-start dark:border-amber-500/35 dark:bg-amber-950/50 dark:ring-amber-500/10'
        variant='warning'>
        <Warning
          className='mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400'
          weight='duotone'
        />
        <AlertDescription className='min-w-0 text-sm leading-relaxed text-foreground/90'>
          {t("mods.mapsWarning")}
        </AlertDescription>
      </Alert>
      <Suspense fallback={<ModsPageSkeleton />}>
        <ErrorBoundary>
          <GetModsData mapsOnly />
        </ErrorBoundary>
      </Suspense>
    </div>
  );
};

export default GetMods;
