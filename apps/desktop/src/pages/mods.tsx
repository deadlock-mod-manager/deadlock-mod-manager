import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Warning } from "@phosphor-icons/react";
import { Suspense, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ContentTypeTabs from "@/components/mod-browsing/content-type-tabs";
import {
  CollectionGrid,
  CollectionGridSkeleton,
} from "@/components/collections/collection-grid";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { usePersistedStore } from "@/lib/store";
import type { ContentType } from "@/lib/store/slices/ui";
import { GetModsData } from "@/components/mod-browsing/catalog/get-mods-data";
import { ModsPageSkeleton } from "@/components/mod-browsing/catalog/mods-page-skeleton";

// Without the custom-maps feature there is no Maps tab, so a stored "map"
// falls back to Mods (where maps stay mixed in).
const resolveContentType = (
  stored: ContentType | undefined,
  isCustomMapsEnabled: boolean,
): ContentType =>
  stored === "map" && !isCustomMapsEnabled ? "mod" : (stored ?? "mod");

const GetMods = () => {
  const { t } = useTranslation();
  const isCustomMapsEnabled = useExperimentalFeature("custom-maps");
  const storedContentType = usePersistedStore(
    (state) => state.modsFilters.contentType,
  );
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );
  const contentType = resolveContentType(
    storedContentType,
    isCustomMapsEnabled,
  );
  const handleContentTypeChange = useCallback(
    (next: ContentType) => updateModsFilters({ contentType: next }),
    [updateModsFilters],
  );

  return (
    <div className='flex h-full min-h-0 w-full flex-col px-4'>
      {/* Sections are scope, not filters: they sit with the title and share
          one hairline with it, leaving a single toolbar row below. */}
      <div className='mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-border/60 border-b'>
        <PageTitle
          className='pb-3'
          subtitle={t("mods.subtitle")}
          title={t("navigation.getMods")}
        />
        <ContentTypeTabs
          className='-mb-px'
          onChange={handleContentTypeChange}
          showMaps={isCustomMapsEnabled}
          value={contentType}
        />
      </div>
      {contentType === "collection" ? (
        <Suspense fallback={<CollectionGridSkeleton />}>
          <ErrorBoundary>
            <CollectionGrid />
          </ErrorBoundary>
        </Suspense>
      ) : (
        <Suspense fallback={<ModsPageSkeleton />}>
          <ErrorBoundary>
            <GetModsData contentType={contentType} />
          </ErrorBoundary>
        </Suspense>
      )}
    </div>
  );
};

export const GetMaps = () => {
  const { t } = useTranslation();

  return (
    <div className='flex h-full min-h-0 w-full flex-col px-4'>
      <PageTitle
        className='mb-4'
        subtitle={t("mods.mapsSubtitle")}
        title={t("navigation.maps")}
      />
      <Alert
        className='mb-5 items-start gap-2.5 border-amber-500/20 bg-amber-500/[0.04] py-2.5 pr-4 pl-3'
        role='note'
        variant='warning'>
        <Warning
          className='mt-px size-4 shrink-0 text-amber-400'
          weight='fill'
        />
        <AlertDescription className='min-w-0 text-[13px] leading-snug text-muted-foreground'>
          <span className='mr-1.5 font-medium text-amber-300'>
            {t("mods.mapsWarningTitle")}
          </span>
          {t("mods.mapsWarning")}
        </AlertDescription>
      </Alert>
      <Suspense fallback={<ModsPageSkeleton />}>
        <ErrorBoundary>
          <GetModsData contentType='map' mapsOnly />
        </ErrorBoundary>
      </Suspense>
    </div>
  );
};

export default GetMods;
