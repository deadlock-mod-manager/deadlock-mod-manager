import { analytics } from "@/lib/analytics";
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
import { useQuery, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { platform } from "@tauri-apps/plugin-os";
import { useTranslation } from "react-i18next";
import { CatalogRefreshButton } from "@/components/mod-browsing/catalog-refresh-button";
import ModCard from "@/components/mod-browsing/mod-card";
import { AuthorSearchResults } from "@/components/mod-browsing/author-search-results";
import SearchBar from "@/components/mod-browsing/search-bar";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { useMod } from "@/hooks/use-mod";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { useSearchQueryState } from "@/hooks/use-search";
import {
  CATALOG_QUERY_DEFAULTS,
  getGameBananaCatalogFacets,
  queryGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import { MOD_OUTDATED_CUTOFF_SECONDS, SortType } from "@/lib/constants";
import { parseGameBananaReference } from "@/lib/mod-interchange";
import { MODS_LIST_QUERY_KEY } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { selectStoreFilters } from "@/lib/store/selectors";
import type {
  ContentType,
  DateFilter,
  FilterMode,
} from "@/lib/store/slices/ui";
import { cn, getDateRange, isDateFilterActive } from "@/lib/utils";
import type { CatalogQuery } from "@/types/generated/CatalogQuery";
import type { SubmissionType } from "@/types/generated/SubmissionType";
import { ModsPagination } from "@/components/mod-browsing/catalog/mods-pagination";

const PAGE_SIZE = 50;

// Continuous scrolling loads the catalog in slices instead of all ~4k entries
// at once. Divisible by every column count (1-6) so loaded rows stay full.
const SCROLL_PAGE_SIZE = 120;

// Start loading the next slice this many rows before the loaded end.
const LOAD_MORE_ROW_THRESHOLD = 4;

const MODS_STORE_PAGE_KEY = "/mods:page";

const MAPS_STORE_PAGE_KEY = "/maps:page";

const MODS_STORE_PAGINATION_SETTING_ID = "mods-store-pagination";

const MOD_ROW_ESTIMATED_HEIGHT = 340;

// Filters each store page last ran with, kept across unmounts so filters set
// from elsewhere (dashboard "See all", skins) reset the page on the next visit.
const lastFilterSignatures = new Map<string, string>();

// Collections come from their own catalog table, not the submissions.
type CatalogContentType = Exclude<ContentType, "collection">;

const CONTENT_SUBMISSION_TYPE = {
  mod: "mod",
  sound: "sound",
  map: "mod",
  wip: "wip",
} satisfies Record<CatalogContentType, SubmissionType>;

const catalogSort = (sort: SortType): CatalogQuery["sort"] => {
  switch (sort) {
    case SortType.LAST_UPDATED:
      return "lastUpdated";
    case SortType.DOWNLOADS:
      return "downloadCount";
    case SortType.RATING:
      return "rating";
    case SortType.RELEASE_DATE:
      return "releaseDate";
    default:
      return "default";
  }
};

export const GetModsData = ({
  contentType,
  mapsOnly,
}: {
  contentType: CatalogContentType;
  mapsOnly?: boolean;
}) => {
  const { t } = useTranslation();
  const isCustomMapsEnabled = useExperimentalFeature("custom-maps");
  const nsfwSettings = usePersistedStore((state) => state.nsfwSettings);
  const filters = usePersistedStore((state) =>
    selectStoreFilters(state, !!mapsOnly),
  );
  const modsStorePaginationEnabled = usePersistedStore(
    (state) => state.settings[MODS_STORE_PAGINATION_SETTING_ID]?.enabled,
  );
  const getPersistedPage = usePersistedStore(
    (state) => state.getScrollPosition,
  );
  const setPersistedPage = usePersistedStore(
    (state) => state.setScrollPosition,
  );
  const updateFilters = usePersistedStore((state) =>
    mapsOnly ? state.updateMapsFilters : state.updateModsFilters,
  );
  const {
    selectedCategories,
    selectedHeroes,
    hideNSFW,
    nsfwOnly: nsfwOnlyFilter,
    hideOutdated,
    updatedFilter,
    addedFilter,
    filterMode,
    showFavoritesOnly = false,
    searchQuery = "",
    currentSort,
  } = filters;
  // A stale NSFW-only filter must not override the global hide setting.
  const nsfwOnly = nsfwOnlyFilter && !nsfwSettings.hideNSFW;
  const favorites = usePersistedStore((state) => state.favorites);
  const pageKey = mapsOnly ? MAPS_STORE_PAGE_KEY : MODS_STORE_PAGE_KEY;
  const scrollKey = mapsOnly ? "/maps" : "/mods";
  const paginationEnabled =
    modsStorePaginationEnabled ?? platform() === "linux";
  const [page, setPage] = useState(() => getPersistedPage(pageKey));
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const catalogQuery = useMemo<CatalogQuery>(() => {
    const updatedRange = getDateRange(updatedFilter);
    const updatedAfter = hideOutdated
      ? Math.max(updatedRange.after ?? 0, MOD_OUTDATED_CUTOFF_SECONDS)
      : updatedRange.after;
    const addedRange = getDateRange(addedFilter);
    return {
      search: debouncedSearchQuery,
      categories: selectedCategories,
      heroes: selectedHeroes,
      authorRemoteId: null,
      excludeFilters: filterMode === "exclude",
      // Sounds are picked by submissionType; maps only by the Maps tab, and
      // Mods leaves them out once that tab exists.
      isAudio: null,
      isMap:
        contentType === "map"
          ? true
          : contentType === "mod" && isCustomMapsEnabled
            ? false
            : null,
      hideNsfw: nsfwSettings.hideNSFW || hideNSFW,
      nsfwOnly,
      hideObsolete: hideOutdated,
      updatedAfter,
      updatedBefore: updatedRange.before,
      addedAfter: addedRange.after,
      addedBefore: addedRange.before,
      favorites: showFavoritesOnly ? favorites : [],
      includeWips: false,
      submissionType: CONTENT_SUBMISSION_TYPE[contentType],
      sort: catalogSort(currentSort),
      page: paginationEnabled ? page : 0,
      pageSize: paginationEnabled ? PAGE_SIZE : SCROLL_PAGE_SIZE,
    };
  }, [
    addedFilter,
    contentType,
    currentSort,
    debouncedSearchQuery,
    favorites,
    filterMode,
    hideNSFW,
    hideOutdated,
    isCustomMapsEnabled,
    nsfwOnly,
    nsfwSettings.hideNSFW,
    page,
    paginationEnabled,
    selectedCategories,
    selectedHeroes,
    showFavoritesOnly,
    updatedFilter,
  ]);
  // Querying with a deferred value keeps the current results on screen while a
  // new filter/search/page loads, instead of suspending back to the skeleton.
  // Only the very first load (nothing to show yet) hits the Suspense fallback.
  const deferredCatalogQuery = useDeferredValue(catalogQuery);
  const isUpdatingResults = deferredCatalogQuery !== catalogQuery;
  // Paginated mode loads exactly the requested page; scrolling mode appends
  // further pages as the virtualized list nears its end.
  const {
    data: catalogPages,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useSuspenseInfiniteQuery({
    queryKey: [
      ...MODS_LIST_QUERY_KEY,
      "gamebanana-direct",
      deferredCatalogQuery,
    ],
    queryFn: ({ pageParam }) =>
      queryGameBananaCatalog({ ...deferredCatalogQuery, page: pageParam }),
    initialPageParam: deferredCatalogQuery.page,
    getNextPageParam: (lastPage) =>
      (lastPage.page + 1) * lastPage.pageSize < lastPage.total
        ? lastPage.page + 1
        : undefined,
    staleTime: STALE_TIME_API,
    retry: 3,
  });
  const catalogPage = catalogPages.pages[0];
  const trackedQuery = useRef<CatalogQuery | null>(null);
  useEffect(() => {
    if (isUpdatingResults || trackedQuery.current === deferredCatalogQuery)
      return;
    trackedQuery.current = deferredCatalogQuery;
    analytics.track("catalog_results_shown", {
      entry_point: deferredCatalogQuery.search ? "search" : "catalog",
      content_type: contentType,
      query_length: deferredCatalogQuery.search.length,
      result_count: catalogPage.total,
      has_results: catalogPage.total > 0,
      category_filter_count: deferredCatalogQuery.categories.length,
      hero_filter_count: deferredCatalogQuery.heroes.length,
    });
  }, [catalogPage.total, contentType, deferredCatalogQuery, isUpdatingResults]);

  const data = useMemo(
    () => catalogPages.pages.flatMap((loadedPage) => loadedPage.items),
    [catalogPages.pages],
  );
  // Filter menus list every option in the current tab, not just loaded rows.
  const facetQuery = useMemo<CatalogQuery>(
    () => ({
      ...CATALOG_QUERY_DEFAULTS,
      isAudio: deferredCatalogQuery.isAudio,
      isMap: deferredCatalogQuery.isMap,
      includeWips: deferredCatalogQuery.includeWips,
      submissionType: deferredCatalogQuery.submissionType,
    }),
    [
      deferredCatalogQuery.isAudio,
      deferredCatalogQuery.isMap,
      deferredCatalogQuery.includeWips,
      deferredCatalogQuery.submissionType,
    ],
  );
  const { data: facets } = useQuery({
    queryKey: [...MODS_LIST_QUERY_KEY, "gamebanana-facets", facetQuery],
    queryFn: () => getGameBananaCatalogFacets(facetQuery),
    staleTime: STALE_TIME_API,
    placeholderData: (previous) => previous,
  });
  const filterOptions = useMemo(
    () =>
      (facets ?? []).map((facet) => ({
        category: facet.category,
        hero: facet.hero,
        name: "",
      })),
    [facets],
  );
  const parentRef = useRef<HTMLDivElement>(null);
  const previousFilterSignatureRef = useRef<string | null>(
    lastFilterSignatures.get(pageKey) ?? null,
  );
  // Defer the mod list so background refetches (staleTime expiry) don't
  // block the UI while thousands of cards and filter options recompute.
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
  const searchQueryState = useMemo(
    () => ({
      query: searchQuery,
      setQuery: (next: string) => updateFilters({ searchQuery: next }),
      sortType: currentSort,
      setSortType: (next: SortType) => updateFilters({ currentSort: next }),
    }),
    [searchQuery, currentSort, updateFilters],
  );
  const { query, setQuery, sortType, setSortType } =
    useSearchQueryState(searchQueryState);
  // A pasted GameBanana id or link shows that mod right away, ahead of the
  // text matches, even when it isn't in the local catalog yet.
  const idReference = parseGameBananaReference(query);
  const { mod: idMatch, isFetching: isFetchingIdMatch } = useMod(
    idReference ?? undefined,
    { retry: 0 },
  );
  const filteredResults = useMemo(
    () =>
      idReference && idMatch
        ? [idMatch, ...deferredData.filter((mod) => mod.id !== idMatch.id)]
        : deferredData,
    [deferredData, idMatch, idReference],
  );
  const isLookingUpId = !!idReference && !idMatch && isFetchingIdMatch;

  const totalPages = paginationEnabled
    ? Math.ceil(catalogPage.total / PAGE_SIZE)
    : 1;
  const displayedMods = useMemo(() => filteredResults, [filteredResults]);
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
  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualRowIndex = virtualRows.at(-1)?.index ?? -1;

  useEffect(() => {
    if (
      paginationEnabled ||
      !hasNextPage ||
      isFetchingNextPage ||
      // A failed page would otherwise be re-requested as soon as it settles.
      isFetchNextPageError ||
      lastVirtualRowIndex < modRows.length - LOAD_MORE_ROW_THRESHOLD
    ) {
      return;
    }
    void fetchNextPage();
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    lastVirtualRowIndex,
    modRows.length,
    paginationEnabled,
  ]);
  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        filterMode,
        contentType,
        currentSort,
        hideNSFW,
        hideOutdated,
        nsfwOnly,
        query,
        selectedCategories,
        selectedHeroes,
        updatedFilter,
        showFavoritesOnly,
        addedFilter,
      }),
    [
      addedFilter,
      filterMode,
      contentType,
      currentSort,
      hideNSFW,
      hideOutdated,
      nsfwOnly,
      query,
      selectedCategories,
      selectedHeroes,
      updatedFilter,
      showFavoritesOnly,
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
    lastFilterSignatures.set(pageKey, filterSignature);
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
    (cats: string[]) => updateFilters({ selectedCategories: cats }),
    [updateFilters],
  );
  const handleFilterModeChange = useCallback(
    (mode: FilterMode) => updateFilters({ filterMode: mode }),
    [updateFilters],
  );
  const handleHeroesChange = useCallback(
    (heroes: string[]) => updateFilters({ selectedHeroes: heroes }),
    [updateFilters],
  );
  const handleHideNSFWChange = useCallback(
    (hideNSFW: boolean) => updateFilters({ hideNSFW }),
    [updateFilters],
  );
  const handleNSFWOnlyChange = useCallback(
    (nsfwOnly: boolean) => updateFilters({ nsfwOnly }),
    [updateFilters],
  );
  const handleHideOutdatedChange = useCallback(
    (hideOutdated: boolean) => updateFilters({ hideOutdated }),
    [updateFilters],
  );

  const handleUpdatedFilterChange = useCallback(
    (updatedFilter: DateFilter) => updateFilters({ updatedFilter }),
    [updateFilters],
  );

  const handleAddedFilterChange = useCallback(
    (addedFilter: DateFilter) => updateFilters({ addedFilter }),
    [updateFilters],
  );

  const handleShowFavoritesOnlyChange = useCallback(
    (showFavoritesOnly: boolean) => updateFilters({ showFavoritesOnly }),
    [updateFilters],
  );

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedHeroes.length > 0 ||
    hideNSFW ||
    nsfwOnly ||
    hideOutdated ||
    showFavoritesOnly ||
    isDateFilterActive(updatedFilter) ||
    isDateFilterActive(addedFilter);

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4'>
      <SearchBar
        trailingActions={<CatalogRefreshButton />}
        filterMode={filterMode}
        mods={filterOptions}
        onCategoriesChange={handleCategoriesChange}
        onFilterModeChange={handleFilterModeChange}
        onHeroesChange={handleHeroesChange}
        onHideNSFWChange={handleHideNSFWChange}
        onHideOutdatedChange={handleHideOutdatedChange}
        nsfwOnly={nsfwSettings.hideNSFW ? undefined : nsfwOnly}
        onNSFWOnlyChange={handleNSFWOnlyChange}
        query={query}
        selectedCategories={selectedCategories}
        selectedHeroes={selectedHeroes}
        setQuery={setQuery}
        setSortType={setSortType}
        hideNSFW={hideNSFW}
        hideOutdated={hideOutdated}
        sortType={sortType}
        showFavoritesFilter={!mapsOnly}
        showFavoritesOnly={showFavoritesOnly}
        onShowFavoritesOnlyChange={handleShowFavoritesOnlyChange}
        updatedFilter={updatedFilter}
        onUpdatedFilterChange={handleUpdatedFilterChange}
        addedFilter={addedFilter}
        onAddedFilterChange={handleAddedFilterChange}
      />
      <AuthorSearchResults
        collection={mapsOnly ? "maps" : "mods"}
        query={deferredCatalogQuery}
      />
      {catalogPage.stale ? (
        <Alert variant='warning'>
          <Warning className='h-4 w-4' />
          <AlertDescription>
            {catalogPage.total === 0
              ? t("mods.catalogSyncing")
              : t("mods.catalogStale")}
          </AlertDescription>
        </Alert>
      ) : null}
      <div
        aria-busy={isUpdatingResults || isLookingUpId}
        className='relative flex min-h-0 flex-1 flex-col'>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 -top-2 z-10 h-0.5 overflow-hidden rounded-full opacity-0 transition-opacity duration-200",
            (isUpdatingResults || isLookingUpId) && "opacity-100 delay-150",
          )}>
          <div className='h-full w-1/3 animate-results-loading rounded-full bg-primary/70 motion-reduce:w-full motion-reduce:animate-none motion-reduce:bg-primary/40' />
        </div>
        {filteredResults.length === 0 ? (
          <Empty
            className={cn(
              "py-12 transition-opacity duration-200",
              (isUpdatingResults || isLookingUpId) && "opacity-50 delay-150",
            )}>
            <EmptyHeader>
              <EmptyMedia variant='default'>
                <MagnifyingGlass className='h-16 w-16' />
              </EmptyMedia>
              <EmptyTitle>{t("mods.noModsFound")}</EmptyTitle>
              <EmptyDescription>
                {query.trim() || hasActiveFilters
                  ? t("mods.noModsMatchFilters")
                  : t("mods.noModsAvailable")}
              </EmptyDescription>
              {hasActiveFilters && (
                <EmptyDescription className='text-xs'>
                  {t("mods.emptyClearFilters")}
                </EmptyDescription>
              )}
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            className={cn(
              "min-h-0 flex-1 overflow-auto transition-opacity duration-200",
              isUpdatingResults && "opacity-50 delay-150",
            )}
            ref={parentRef}>
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
                    <ModCard
                      key={mod.id}
                      mod={mod}
                      collection={mapsOnly ? "maps" : "mods"}
                    />
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
                {virtualRows.map((virtualRow) => (
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
                        <ModCard
                          key={mod.id}
                          mod={mod}
                          collection={mapsOnly ? "maps" : "mods"}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
