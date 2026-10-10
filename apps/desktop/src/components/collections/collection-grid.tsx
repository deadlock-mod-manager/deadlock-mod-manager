import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { Package } from "@deadlock-mods/ui/icons";
import { CardsThreeIcon, MagnifyingGlass } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSearchQueryState } from "@/hooks/use-search";
import { collectionsQueryOptions } from "@/lib/collections/queries";
import { usePersistedStore } from "@/lib/store";
import type { CatalogCollectionDto } from "@/types/generated/CatalogCollectionDto";
import HeroFilter from "@/components/mod-browsing/hero-filter";
import { CollectionCard, CollectionCardSkeleton } from "./collection-card";

const GRID_CLASS =
  "grid grid-cols-2 gap-4 px-1 pr-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

// Same fuzziness as the local mod search.
const COLLECTION_SEARCH_THRESHOLD = 0.35;

// Item-count ranges; collections under 10 items aren't listed at all.
const SIZE_RANGES = {
  any: [0, Infinity],
  small: [10, 24],
  medium: [25, 49],
  large: [50, 99],
  huge: [100, Infinity],
} as const;
type SizeRange = keyof typeof SIZE_RANGES;

const CollectionSection = ({
  title,
  collections,
}: {
  title?: string;
  collections: CatalogCollectionDto[];
}) => (
  <section className='flex flex-col gap-3'>
    {title && <h2 className='px-1 font-semibold text-lg'>{title}</h2>}
    <div className={GRID_CLASS}>
      {collections.map((collection) => (
        <CollectionCard collection={collection} key={collection.id} />
      ))}
    </div>
  </section>
);

export const CollectionGrid = () => {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(collectionsQueryOptions());
  const hideNSFW = usePersistedStore((state) => state.nsfwSettings.hideNSFW);
  const [size, setSize] = useState<SizeRange>("any");
  const [heroes, setHeroes] = useState<string[]>([]);
  const visible = useMemo(
    () => (hideNSFW ? data.filter((collection) => !collection.isNsfw) : data),
    [data, hideNSFW],
  );
  const collections = useMemo(() => {
    const [min, max] = SIZE_RANGES[size];
    const sized = visible.filter(
      ({ itemCount }) => itemCount >= min && itemCount <= max,
    );
    if (heroes.length === 0) return sized;
    // Collections built around a picked hero come before ones that merely include them.
    const heroRank = (collection: CatalogCollectionDto) =>
      Math.min(
        ...heroes.map((hero) => {
          const index = collection.heroes.indexOf(hero);
          return index === -1 ? Infinity : index;
        }),
      );
    return sized
      .map((collection) => ({ collection, rank: heroRank(collection) }))
      .filter(({ rank }) => rank !== Infinity)
      .sort((a, b) => a.rank - b.rank)
      .map(({ collection }) => collection);
  }, [visible, size, heroes]);
  // Shares the store's query with the other sections, so a search carries
  // over when switching tabs.
  const { query, setQuery } = useSearchQueryState();
  const debouncedQuery = useDebouncedValue(query, 300).trim();
  const fuse = useMemo(
    () =>
      new Fuse(collections, {
        keys: ["name", "description", "author"],
        threshold: COLLECTION_SEARCH_THRESHOLD,
      }),
    [collections],
  );

  if (visible.length === 0) {
    return (
      <Empty className='py-12'>
        <EmptyHeader>
          <EmptyMedia variant='default'>
            <CardsThreeIcon className='h-16 w-16' />
          </EmptyMedia>
          <EmptyTitle>{t("collections.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("collections.emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const results = debouncedQuery
    ? fuse.search(debouncedQuery).map((result) => result.item)
    : null;
  const featured = collections.filter((collection) => collection.isFeatured);

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='min-w-48 max-w-sm flex-1'>
          <SearchInput
            className='w-full'
            id='search'
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("collections.searchPlaceholder")}
            value={query}
          />
        </div>
        <HeroFilter
          mods={[]}
          onHeroesChange={setHeroes}
          selectedHeroes={heroes}
        />
        <Select
          onValueChange={(value) => setSize(value as SizeRange)}
          value={size}>
          <SelectTrigger
            aria-label={t("collections.size.label")}
            className='w-fit gap-1'>
            <Package className='mr-1.5 h-4 w-4 text-muted-foreground' />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(SIZE_RANGES).map((range) => (
              <SelectItem key={range} value={range}>
                {t(`collections.size.${range}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(results ?? collections).length === 0 ? (
        <Empty className='py-12'>
          <EmptyHeader>
            <EmptyMedia variant='default'>
              <MagnifyingGlass className='h-16 w-16' />
            </EmptyMedia>
            <EmptyTitle>{t("collections.noResultsTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("collections.noResultsDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='min-h-0 flex-1 overflow-auto pb-24'>
          <div className='flex flex-col gap-8'>
            {results ? (
              <CollectionSection collections={results} />
            ) : (
              <>
                {featured.length > 0 && (
                  <CollectionSection
                    collections={featured}
                    title={t("collections.featured")}
                  />
                )}
                <CollectionSection
                  collections={collections.filter(
                    (collection) => !collection.isFeatured,
                  )}
                  title={t("collections.all")}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const CollectionGridSkeleton = () => (
  <div className='flex min-h-0 flex-1 flex-col gap-4'>
    <Skeleton className='h-10 w-80' />
    <div className='min-h-0 flex-1 overflow-hidden'>
      <div className={GRID_CLASS}>
        {Array.from({ length: 12 }, (_, index) => (
          <CollectionCardSkeleton key={index} />
        ))}
      </div>
    </div>
  </div>
);
