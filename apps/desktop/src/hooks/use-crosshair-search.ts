import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import Fuse, { type FuseOptionKey } from "fuse.js";
import { useCallback, useMemo } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { SortType } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";

type UseCrosshairSearchProps = {
  data: PublishedCrosshairDto[];
};

export const useCrosshairSearch = ({ data }: UseCrosshairSearchProps) => {
  const { crosshairFilters, updateCrosshairFilters } = usePersistedStore();
  const query = crosshairFilters.searchQuery || "";
  const debouncedQuery = useDebouncedValue(query, 300);
  const sortType = crosshairFilters.currentSort;

  const fuse = useMemo(
    () =>
      new Fuse(data, {
        keys: [
          "name",
          "description",
          "tags",
          "userName",
        ] as FuseOptionKey<PublishedCrosshairDto>[],
        shouldSort: true,
        useExtendedSearch: true,
      }),
    [data],
  );

  const search = useCallback(
    (q: string) => {
      if (!q || !q.trim()) {
        return sortCrosshairs(data, sortType);
      }
      const results = fuse.search(q);
      const items = results.map((result) => result.item);
      return sortCrosshairs(items, sortType);
    },
    [fuse, data, sortType],
  );

  const results = useMemo(
    () => search(debouncedQuery),
    [search, debouncedQuery],
  );

  const setQuery = (newQuery: string) => {
    updateCrosshairFilters({ searchQuery: newQuery });
  };

  const setSortType = (newSortType: SortType) => {
    updateCrosshairFilters({ currentSort: newSortType });
  };

  return {
    search,
    query,
    setQuery,
    results,
    sortType,
    setSortType,
  };
};

function sortCrosshairs(
  crosshairs: PublishedCrosshairDto[],
  sortType: SortType,
): PublishedCrosshairDto[] {
  const sorted = [...crosshairs];

  switch (sortType) {
    case "default":
      return sorted;
    case "last updated":
      return sorted.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    case "download count":
      return sorted.sort((a, b) => b.downloads - a.downloads);
    case "rating":
      return sorted.sort((a, b) => b.likes - a.likes);
    case "release date":
      return sorted.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    default:
      return sorted;
  }
}
