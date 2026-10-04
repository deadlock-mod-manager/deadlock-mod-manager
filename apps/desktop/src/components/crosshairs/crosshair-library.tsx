import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowCounterClockwiseIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Button } from "@deadlock-mods/ui/components/button";
import { invoke } from "@tauri-apps/api/core";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useCrosshairSearch } from "@/hooks/use-crosshair-search";
import { getCrosshairs } from "@/lib/api-client";
import logger from "@/lib/logger";
import { isTauriError } from "@/types/tauri";
import { usePersistedStore } from "@/lib/store";
import { CrosshairCard } from "./crosshair-card";
import { CrosshairPreviewDialog } from "./crosshair-preview-dialog";
import CrosshairSearchBar from "./crosshair-search-bar";

const CrosshairLibraryData = () => {
  const { t } = useTranslation();
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
      logger.errorOnly(error);
      if (isTauriError(error) && error.kind === "gameRunning") {
        toast.error(t("crosshairs.stopGameBeforeChange"));
        return;
      }
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

  return (
    <section className='flex flex-col gap-4'>
      <div>
        <h2 className='text-lg font-semibold'>{t("crosshairs.community")}</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          {t("crosshairs.communityDescription")}
        </p>
      </div>
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
              <MagnifyingGlassIcon className='h-16 w-16' />
            </EmptyMedia>
            <EmptyTitle>{t("crosshairs.noCrosshairsFound")}</EmptyTitle>
            <EmptyDescription>
              {query.trim() ||
              selectedHeroes.length > 0 ||
              selectedTags.length > 0
                ? t("crosshairs.noCrosshairsMatchFilters")
                : t("crosshairs.noCrosshairs")}
            </EmptyDescription>
            {(query.trim() ||
              selectedHeroes.length > 0 ||
              selectedTags.length > 0) && (
              <Button
                variant='outline'
                icon={<ArrowCounterClockwiseIcon aria-hidden />}
                onClick={() => {
                  setQuery("");
                  updateCrosshairFilters({
                    selectedHeroes: [],
                    selectedTags: [],
                  });
                }}>
                {t("crosshairs.resetSearch")}
              </Button>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <CrosshairResults
          key={JSON.stringify([
            query,
            sortType,
            selectedHeroes,
            selectedTags,
            filterMode,
          ])}
          crosshairs={filteredResults}
          activeCrosshair={activeCrosshair}
          onPreview={setPreviewCrosshair}
        />
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
    </section>
  );
};

const PAGE_SIZE = 24;

const CrosshairResults = ({
  crosshairs,
  activeCrosshair,
  onPreview,
}: {
  crosshairs: PublishedCrosshairDto[];
  activeCrosshair: PublishedCrosshairDto["config"] | null;
  onPreview: (crosshair: PublishedCrosshairDto) => void;
}) => {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(crosshairs.length / PAGE_SIZE) - 1),
  );
  const start = currentPage * PAGE_SIZE;
  return (
    <>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-sm text-muted-foreground' role='status'>
          {t("crosshairs.resultRange", {
            start: start + 1,
            end: Math.min(start + PAGE_SIZE, crosshairs.length),
            total: crosshairs.length,
          })}
        </p>
        {crosshairs.length > PAGE_SIZE && (
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={currentPage === 0}
              icon={<CaretLeftIcon aria-hidden />}
              onClick={() => setPage(currentPage - 1)}>
              {t("crosshairs.previousPage")}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={start + PAGE_SIZE >= crosshairs.length}
              onClick={() => setPage(currentPage + 1)}>
              {t("crosshairs.nextPage")}
              <CaretRightIcon aria-hidden />
            </Button>
          </div>
        )}
      </div>
      <div className='grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3'>
        {crosshairs.slice(start, start + PAGE_SIZE).map((crosshair) => (
          <CrosshairCard
            key={crosshair.id}
            crosshair={crosshair}
            isActive={
              JSON.stringify(activeCrosshair) ===
              JSON.stringify(crosshair.config)
            }
            onPreviewOpen={() => onPreview(crosshair)}
          />
        ))}
      </div>
    </>
  );
};

const CrosshairLibrarySkeleton = () => {
  return (
    <div className='flex h-full min-h-0 flex-col gap-4'>
      <div className='min-h-0 flex-1 overflow-auto'>
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
