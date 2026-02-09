import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useCrosshairSearch } from "@/hooks/use-crosshair-search";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { getCrosshairs } from "@/lib/api";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { CrosshairCard } from "./crosshair-card";
import { CrosshairPreviewDialog } from "./crosshair-preview-dialog";
import CrosshairSearchBar from "./crosshair-search-bar";

const CrosshairLibraryData = () => {
  const { t } = useTranslation();
  const { setScrollElement, scrollY } = useScrollPosition("/crosshairs");
  const {
    activeCrosshair,
    crosshairFilters,
    updateCrosshairFilters,
    setActiveCrosshair,
  } = usePersistedStore();
  const crosshairsEnabled = usePersistedStore(
    (state) => state.crosshairsEnabled,
  );
  const [previewCrosshair, setPreviewCrosshair] =
    useState<PublishedCrosshairDto | null>(null);
  const queryClient = useQueryClient();

  const { data, error } = useSuspenseQuery({
    queryKey: ["crosshairs"],
    queryFn: getCrosshairs,
    retry: 3,
  });

  const applyCrosshairMutation = useMutation({
    mutationFn: (crosshairConfig: PublishedCrosshairDto["config"]) => {
      if (!crosshairsEnabled) {
        throw new Error("Custom crosshairs are disabled");
      }
      return invoke("apply_crosshair_to_autoexec", { config: crosshairConfig });
    },
    meta: {
      skipGlobalErrorHandler: true,
    },
    onSuccess: (_, crosshairConfig) => {
      setActiveCrosshair(crosshairConfig);
      toast.success(t("crosshairs.appliedRestart"));
      queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
    },
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      if (
        error instanceof Error &&
        error.message === "Custom crosshairs are disabled"
      ) {
        toast.error(t("crosshairs.disabledError"));
      } else {
        toast.error(t("crosshairs.form.applyError"));
      }
    },
  });

  const handleApply = () => {
    if (!previewCrosshair?.config) return;
    applyCrosshairMutation.mutate(previewCrosshair.config);
  };

  useEffect(() => {
    if (error) {
      const errorMessage =
        error instanceof Error ? error.message : t("crosshairs.loadError");
      toast.error(errorMessage);
    }
  }, [error, t]);

  const { selectedHeroes, selectedTags, filterMode } = crosshairFilters;

  const { results, query, setQuery, sortType, setSortType } =
    useCrosshairSearch({
      data: data ?? [],
    });

  const filteredResults = useMemo(() => {
    let filtered = results;

    if (selectedHeroes.length > 0) {
      filtered = filtered.filter((crosshair) => {
        const matchesHero = crosshair.heroes.some((hero) =>
          selectedHeroes.includes(hero),
        );
        return filterMode === "include" ? matchesHero : !matchesHero;
      });
    }

    if (selectedTags.length > 0) {
      filtered = filtered.filter((crosshair) => {
        const matchesTag = crosshair.tags.some((tag) =>
          selectedTags.includes(tag),
        );
        return filterMode === "include" ? matchesTag : !matchesTag;
      });
    }

    return filtered;
  }, [results, selectedHeroes, selectedTags, filterMode]);

  const parentRef = useRef<HTMLDivElement>(null);
  const columnsPerRow = useResponsiveColumns();

  const crosshairRows = useMemo(() => {
    const rows: PublishedCrosshairDto[][] = [];
    for (let i = 0; i < filteredResults.length; i += columnsPerRow) {
      rows.push(filteredResults.slice(i, i + columnsPerRow));
    }
    return rows;
  }, [columnsPerRow, filteredResults]);

  const rowVirtualizer = useVirtualizer({
    count: crosshairRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 320,
    overscan: 2,
    initialOffset: scrollY,
  });

  useEffect(() => {
    if (parentRef.current) {
      setScrollElement(parentRef.current);
    }
  }, [setScrollElement]);

  return (
    <div className='flex flex-col gap-4'>
      <CrosshairSearchBar
        crosshairs={data ?? []}
        filterMode={filterMode}
        onFilterModeChange={(mode) =>
          updateCrosshairFilters({ filterMode: mode })
        }
        onHeroesChange={(heroes) =>
          updateCrosshairFilters({ selectedHeroes: heroes })
        }
        onTagsChange={(tags) => updateCrosshairFilters({ selectedTags: tags })}
        query={query}
        selectedHeroes={selectedHeroes}
        selectedTags={selectedTags}
        setQuery={setQuery}
        setSortType={setSortType}
        sortType={sortType}
      />
      {filteredResults.length === 0 ? (
        <Empty className='py-12'>
          <EmptyHeader>
            <EmptyMedia variant='default'>
              <MagnifyingGlass className='h-16 w-16' />
            </EmptyMedia>
            <EmptyTitle>{t("crosshairs.noCrosshairsFound")}</EmptyTitle>
            <EmptyDescription>
              {query.trim() ||
              selectedHeroes.length > 0 ||
              selectedTags.length > 0
                ? t("crosshairs.noCrosshairsMatchFilters")
                : t("crosshairs.noCrosshairs")}
            </EmptyDescription>
            {(selectedHeroes.length > 0 || selectedTags.length > 0) && (
              <EmptyDescription className='text-xs'>
                {t("crosshairs.tryClearingFilters")}
              </EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='h-[calc(100vh-280px)] overflow-auto' ref={parentRef}>
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
                  {crosshairRows[virtualRow.index]?.map((crosshair) => (
                    <CrosshairCard
                      key={crosshair.id}
                      crosshair={crosshair}
                      isActive={
                        activeCrosshair
                          ? JSON.stringify(activeCrosshair) ===
                            JSON.stringify(crosshair.config)
                          : false
                      }
                      onPreviewOpen={() => setPreviewCrosshair(crosshair)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {previewCrosshair && (
        <CrosshairPreviewDialog
          open={!!previewCrosshair}
          onOpenChange={(open) => {
            if (!open) setPreviewCrosshair(null);
          }}
          crosshair={previewCrosshair}
          onApply={handleApply}
          isApplying={applyCrosshairMutation.isPending}
        />
      )}
    </div>
  );
};

const CrosshairLibrarySkeleton = () => {
  return (
    <div className='flex flex-col gap-4'>
      <div className='h-[calc(100vh-280px)] overflow-auto'>
        <div className='grid grid-cols-1 gap-4 px-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
          {Array.from({ length: 12 }, () => (
            <div
              key={crypto.randomUUID()}
              className='h-[280px] rounded-lg bg-muted animate-pulse'
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export const CrosshairLibrary = () => {
  return (
    <Suspense fallback={<CrosshairLibrarySkeleton />}>
      <ErrorBoundary>
        <CrosshairLibraryData />
      </ErrorBoundary>
    </Suspense>
  );
};
