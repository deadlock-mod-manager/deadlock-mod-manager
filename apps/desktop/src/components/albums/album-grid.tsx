import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { CardsThreeIcon, MagnifyingGlass } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSearchQueryState } from "@/hooks/use-search";
import { deadlockSkinsAlbumsQueryOptions } from "@/lib/deadlockskins/albums";
import { AlbumCard, AlbumCardSkeleton } from "./album-card";
import { DeadlockSkinsCredit } from "./deadlockskins-credit";

const GRID_CLASS =
  "grid grid-cols-2 gap-4 px-1 pr-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

// Same fuzziness as the local mod search.
const ALBUM_SEARCH_THRESHOLD = 0.35;

export const AlbumGrid = () => {
  const { t } = useTranslation();
  const { data: albums } = useSuspenseQuery(deadlockSkinsAlbumsQueryOptions());
  // Shares the store's query with the other sections, so a search carries
  // over when switching tabs.
  const { query, setQuery } = useSearchQueryState();
  const debouncedQuery = useDebouncedValue(query, 300).trim();
  const fuse = useMemo(
    () =>
      new Fuse(albums, {
        keys: ["name", "description"],
        threshold: ALBUM_SEARCH_THRESHOLD,
      }),
    [albums],
  );
  const results = debouncedQuery
    ? fuse.search(debouncedQuery).map((result) => result.item)
    : albums;

  if (albums.length === 0) {
    return (
      <Empty className='py-12'>
        <EmptyHeader>
          <EmptyMedia variant='default'>
            <CardsThreeIcon className='h-16 w-16' />
          </EmptyMedia>
          <EmptyTitle>{t("albums.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("albums.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='min-w-48 max-w-sm flex-1'>
          <SearchInput
            className='w-full'
            id='search'
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("albums.searchPlaceholder")}
            value={query}
          />
        </div>
        <DeadlockSkinsCredit className='ml-auto' />
      </div>
      {results.length === 0 ? (
        <Empty className='py-12'>
          <EmptyHeader>
            <EmptyMedia variant='default'>
              <MagnifyingGlass className='h-16 w-16' />
            </EmptyMedia>
            <EmptyTitle>{t("albums.noResultsTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("albums.noResultsDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='min-h-0 flex-1 overflow-auto pb-24'>
          <div className={GRID_CLASS}>
            {results.map((album) => (
              <AlbumCard album={album} key={album.slug} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const AlbumGridSkeleton = () => (
  <div className='flex min-h-0 flex-1 flex-col gap-4'>
    <Skeleton className='h-10 w-80' />
    <div className='min-h-0 flex-1 overflow-hidden'>
      <div className={GRID_CLASS}>
        {Array.from({ length: 12 }, (_, index) => (
          <AlbumCardSkeleton key={index} />
        ))}
      </div>
    </div>
  </div>
);
