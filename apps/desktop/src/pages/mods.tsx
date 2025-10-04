import type { ModDto } from "@deadlock-mods/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Suspense, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { toast } from "sonner";
import ModCard from "@/components/mod-browsing/mod-card";
import SearchBar from "@/components/mod-browsing/search-bar";
import SearchBarSkeleton from "@/components/mod-browsing/search-bar-skeleton";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { useSearch } from "@/hooks/use-search";
import { getMods } from "@/lib/api";
import { ModCategory } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import { isModOutdated } from "@/lib/utils";

const GetModsData = () => {
  const { t } = useTranslation();
  const { data, error } = useQuery("mods", getMods, {
    suspense: true,
    useErrorBoundary: false,
    retry: 3,
  });
  const { nsfwSettings, modsFilters, updateModsFilters } = usePersistedStore();
  const {
    showSafe,
    showNSFW,
    showOutdated,
    showAudioOnly,
    selectedCategories,
    selectedHeroes,
  } = modsFilters;
  const { results, query, setQuery, sortType, setSortType } = useSearch({
    data: data ?? [],
    keys: ["name", "description", "author"],
  });

  const { setScrollElement, scrollY } = useScrollPosition("/mods");

  let filteredResults = results;

  // Filter by content type (safe/NSFW/outdated)
  filteredResults = filteredResults.filter((mod) => {
    const isOutdated = isModOutdated(mod);
    const isNSFW = mod.isNSFW;

    // If outdated, only include if showOutdated is true
    if (isOutdated && !showOutdated) return false;

    // If NSFW, only include if showNSFW is true
    if (isNSFW && !showNSFW) return false;

    // If safe (not NSFW), only include if showSafe is true
    if (!isNSFW && !showSafe) return false;

    return true;
  });

  // Filter by categories (only show selected categories)
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

  // Filter by heroes (only show selected heroes)
  if (selectedHeroes.length > 0) {
    filteredResults = filteredResults.filter((mod) => {
      if (selectedHeroes.includes("None")) {
        return (
          !mod.hero || (mod.hero !== null && selectedHeroes.includes(mod.hero))
        );
      }
      return mod.hero !== null && selectedHeroes.includes(mod.hero);
    });
  }

  // Apply global NSFW setting (this overrides the toggle)
  if (nsfwSettings.hideNSFW) {
    filteredResults = filteredResults.filter((mod) => !mod.isNSFW);
  }

  // Filter by audio mods only (if enabled)
  if (!showAudioOnly) {
    filteredResults = filteredResults.filter((mod) => !mod.isAudio);
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
      toast.error((error as Error)?.message ?? t("common.failedToFetchMods"));
    }
  }, [error, t]);

  return (
    <div className='flex flex-col gap-4'>
      <SearchBar
        mods={data ?? []}
        onCategoriesChange={(selectedCategories) =>
          updateModsFilters({ selectedCategories })
        }
        onHeroesChange={(selectedHeroes) =>
          updateModsFilters({ selectedHeroes })
        }
        onShowSafeChange={(showSafe) => updateModsFilters({ showSafe })}
        onShowNSFWChange={(showNSFW) => updateModsFilters({ showNSFW })}
        onShowOutdatedChange={(showOutdated) =>
          updateModsFilters({ showOutdated })
        }
        onShowAudioOnlyChange={(showAudioOnly) =>
          updateModsFilters({ showAudioOnly })
        }
        query={query}
        selectedCategories={selectedCategories}
        selectedHeroes={selectedHeroes}
        setQuery={setQuery}
        setSortType={setSortType}
        showSafe={showSafe}
        showNSFW={showNSFW}
        showOutdated={showOutdated}
        showAudioOnly={showAudioOnly}
        sortType={sortType}
      />
      {filteredResults.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-12 text-center'>
          <div className='mb-2 text-muted-foreground'>
            <svg
              className='mx-auto mb-4 h-12 w-12'
              fill='none'
              stroke='currentColor'
              strokeWidth={1.5}
              viewBox='0 0 24 24'>
              <path
                d='m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </svg>
          </div>
          <h3 className='mb-1 font-medium text-lg'>{t("mods.noModsFound")}</h3>
          <p className='text-muted-foreground text-sm'>
            {query.trim() ||
            selectedCategories.length > 0 ||
            selectedHeroes.length > 0 ||
            !showSafe ||
            showNSFW ||
            showOutdated ||
            !showAudioOnly
              ? t("mods.noModsMatchFilters")
              : t("mods.noModsAvailable")}
          </p>
          {(selectedCategories.length > 0 ||
            selectedHeroes.length > 0 ||
            !showSafe ||
            showNSFW ||
            showOutdated ||
            !showAudioOnly) && (
            <p className='mt-2 text-muted-foreground text-xs'>
              Try clearing some filters to see more results
            </p>
          )}
        </div>
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
                <div className='grid grid-cols-4 gap-4 px-1'>
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
    <div className='h-[calc(100vh-160px)] w-full px-4'>
      <PageTitle
        className='mb-4'
        subtitle={t("mods.subtitle")}
        title={t("navigation.getMods")}
      />
      <Suspense
        fallback={
          <div className='flex flex-col gap-4'>
            <SearchBarSkeleton />
            <div className='grid grid-cols-4 gap-4'>
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
