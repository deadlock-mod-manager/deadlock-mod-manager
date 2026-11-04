import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { RefreshCw } from "@deadlock-mods/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ModCard from "@/components/mod-browsing/mod-card";
import { SourceSelector } from "@/components/mod-browsing/source-selector";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  NATIVE_SOURCES_QUERY_KEY,
  nativeListingMatchesContentType,
  nativeListingVisible,
  queryNativeSource,
  refreshNativeSource,
  toNativeModDto,
  useNativeSources,
} from "@/lib/mod-sources";
import type { ContentType } from "@/lib/store/slices/ui";
import { usePersistedStore } from "@/lib/store";
import { ModsPageSkeleton } from "./mods-page-skeleton";

interface NativeSourceCatalogProps {
  sourceKey: string;
  onSourceChange: (sourceKey: string) => void;
  contentType: ContentType;
}

export const NativeSourceCatalog = ({
  sourceKey,
  onSourceChange,
  contentType,
}: NativeSourceCatalogProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const sources = useNativeSources();
  const source = sources.data?.find(
    (item) => item.key === sourceKey && !item.removed,
  );
  const [search, setSearch] = useState("");
  const hideAdult = usePersistedStore(
    (state) => state.nsfwSettings.hideNSFW || state.modsFilters.hideNSFW,
  );
  const debouncedSearch = useDebouncedValue(search, 250);
  const listings = useQuery({
    queryKey: [
      ...NATIVE_SOURCES_QUERY_KEY,
      "catalog",
      sourceKey,
      debouncedSearch,
    ],
    queryFn: () => queryNativeSource(sourceKey, debouncedSearch),
    enabled: !!source?.enabled,
  });
  const refresh = useMutation({
    mutationFn: () => refreshNativeSource(sourceKey),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: NATIVE_SOURCES_QUERY_KEY }),
    meta: { skipGlobalErrorHandler: true },
  });
  const items =
    listings.data?.filter(
      (listing) =>
        nativeListingMatchesContentType(listing, contentType) &&
        nativeListingVisible(listing, hideAdult),
    ) ?? [];
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='min-w-40 flex-1'>
          <SearchInput
            className='min-w-40 flex-1'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("modSources.search")}
            aria-label={t("modSources.search")}
          />
        </div>
        <SourceSelector value={sourceKey} onChange={onSourceChange} />
        <Button
          variant='outline'
          size='icon'
          disabled={refresh.isPending || !source?.enabled}
          aria-label={t("modSources.refresh", {
            name: source?.descriptor.name ?? "",
          })}
          onClick={() => refresh.mutate()}>
          <RefreshCw className='size-4' />
        </Button>
      </div>
      {(source?.lastError || refresh.error) && (
        <Alert variant='warning'>
          <AlertDescription>
            {refresh.error?.message ?? source?.lastError}{" "}
            {t("modSources.cachedResults")}
          </AlertDescription>
        </Alert>
      )}
      {hideAdult &&
        listings.data?.some((listing) => listing.isNsfw === null) && (
          <p className='text-xs text-muted-foreground'>
            {t("modSources.unknownClassification")}
          </p>
        )}
      {(!source?.enabled || listings.error) && (
        <Alert variant='warning'>
          <AlertDescription>
            {listings.error?.message ?? t("modSources.sourceUnavailable")}
          </AlertDescription>
        </Alert>
      )}
      {listings.isLoading && <ModsPageSkeleton />}
      <div className='min-h-0 flex-1 overflow-y-auto pb-4'>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          {source &&
            items.map((listing) => (
              <ModCard
                key={listing.remoteId}
                mod={toNativeModDto(source, listing)}
              />
            ))}
        </div>
        {!listings.isLoading && !listings.error && items.length === 0 && (
          <p className='py-12 text-center text-sm text-muted-foreground'>
            {t("mods.noModsFound")}
          </p>
        )}
      </div>
    </div>
  );
};
