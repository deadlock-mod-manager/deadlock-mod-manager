import type { ModDto } from "@deadlock-mods/shared";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Suspense, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import ModCard from "@/components/mod-browsing/mod-card";
import SearchBar from "@/components/mod-browsing/search-bar";
import SearchBarSkeleton from "@/components/mod-browsing/search-bar-skeleton";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { useSearch } from "@/hooks/use-search";
import { getMods } from "@/lib/api";
import { ModCategory } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";

const GetModsData = () => {
  const { t } = useTranslation();
  const { data, error } = useQuery("mods", getMods, {
    suspense: true,
    useErrorBoundary: false,
    retry: 3,
  });
  const { nsfwSettings, modsFilters, updateModsFilters } = usePersistedStore();
  const {
    selectedCategories,
    selectedHeroes,
    showAudioOnly,
    showNSFW,
    filterMode,
  } = modsFilters;
  const { results, query, setQuery, sortType, setSortType } = useSearch({
    data: data ?? [],
    keys: ["name", "description", "author"],
  });

  const { setScrollElement, scrollY } = useScrollPosition("/mods");

  let filteredResults = results;

  // Filter by categories
  if (selectedCategories.length > 0) {
    filteredResults = filteredResults.filter((mod) => {
      let matchesCategory = false;

      // Check if mod category is in selected categories
      if (selectedCategories.includes(mod.category)) {
        matchesCategory = true;
      }

      // If OTHER_MISC is selected, include mods with non-predefined categories
      if (
        !matchesCategory &&
        selectedCategories.includes(ModCategory.OTHER_MISC)
      ) {
        const predefinedCategories = Object.values(ModCategory);
        matchesCategory = !predefinedCategories.includes(
          mod.category as ModCategory,
        );
      }

      // Return based on filter mode
      return filterMode === "include" ? matchesCategory : !matchesCategory;
    });
  }

  if (selectedHeroes.length > 0) {
    filteredResults = filteredResults.filter((mod) => {
      let matchesHero = false;

      if (selectedHeroes.includes("None")) {
        matchesHero =
          !mod.hero || (mod.hero !== null && selectedHeroes.includes(mod.hero));
      } else {
        matchesHero = mod.hero !== null && selectedHeroes.includes(mod.hero);
      }

      // Return based on filter mode
      return filterMode === "include" ? matchesHero : !matchesHero;
    });
  }

  if (nsfwSettings.hideNSFW) {
    filteredResults = filteredResults.filter((mod) => !mod.isNSFW);
  }

  if (showNSFW) {
    filteredResults = filteredResults.filter((mod) => {
      const isNSFW = mod.isNSFW;
      return filterMode === "include" ? isNSFW : !isNSFW;
    });
  }

  if (showAudioOnly) {
    filteredResults = filteredResults.filter((mod) => {
      const isAudio = mod.isAudio;
      // Return based on filter mode
      return filterMode === "include" ? isAudio : !isAudio;
    });
  }

  const parentRef = useRef<HTMLDivElement>(null);
  const columnsPerRow = useResponsiveColumns();

  const modRows: ModDto[][] = [];
  for (let i = 0; i < filteredResults.length; i += columnsPerRow) {
    modRows.push(filteredResults.slice(i, i + columnsPerRow));
  }

  const rowVirtualizer = useVirtualizer({
    count: modRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 320 + 20,
    overscan: 2,
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

  return (
    <div className='flex flex-col gap-4'>
      <SearchBar
        filterMode={filterMode}
        mods={data ?? []}
        onCategoriesChange={(selectedCategories) =>
          updateModsFilters({ selectedCategories })
        }
        onFilterModeChange={(filterMode) => updateModsFilters({ filterMode })}
        onHeroesChange={(selectedHeroes) =>
          updateModsFilters({ selectedHeroes })
        }
        onShowAudioOnlyChange={(showAudioOnly) =>
          updateModsFilters({ showAudioOnly })
        }
        onShowNSFWChange={(showNSFW) => updateModsFilters({ showNSFW })}
        query={query}
        selectedCategories={selectedCategories}
        selectedHeroes={selectedHeroes}
        setQuery={setQuery}
        setSortType={setSortType}
        showAudioOnly={showAudioOnly}
        showNSFW={showNSFW}
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
              !nsfwSettings.hideNSFW ||
              showAudioOnly
                ? t("mods.noModsMatchFilters")
                : t("mods.noModsAvailable")}
            </EmptyDescription>
            {(selectedCategories.length > 0 ||
              selectedHeroes.length > 0 ||
              !nsfwSettings.hideNSFW ||
              showAudioOnly) && (
              <EmptyDescription className='text-xs'>
                Try clearing some filters to see more results
              </EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          className='scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin h-[calc(100vh-280px)] overflow-auto'
          ref={parentRef} // Dynamic height for virtualization accounting for title + search bar
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
        className='mb-4'
        subtitle={t("mods.subtitle")}
        title={t("navigation.getMods")}
      />
      <Suspense
        fallback={
          <div className='flex flex-col gap-4'>
            <SearchBarSkeleton />
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
              {Array.from({ length: 25 }, () => (
                <ModCard key={crypto.randomUUID()} mod={undefined} />
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
