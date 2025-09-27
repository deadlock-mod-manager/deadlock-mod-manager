import Fuse, { type FuseOptionKey } from "fuse.js";
import { useCallback, useMemo } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { SortType } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import { sortMods } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

type UseSearchProps<T> = {
  data: T[];
  keys: (keyof T)[];
};

export const useSearch = <T = LocalMod>({ data, keys }: UseSearchProps<T>) => {
  const { modsFilters, updateModsFilters } = usePersistedStore();
  const query = modsFilters.searchQuery || "";
  const debouncedQuery = useDebouncedValue(query, 300);
  const sortType = modsFilters.currentSort;

  const fuse = useMemo(
    () =>
      new Fuse(data, {
        keys: keys as FuseOptionKey<T>[],
        shouldSort: true,
        useExtendedSearch: true,
      }),
    [data, keys],
  );

  const search = useCallback(
    (q: string) => {
      if (!q || !q.trim()) {
        return sortMods(data as LocalMod[], sortType);
      }
      const results = fuse.search(q);
      return results.map((result) => result.item) as LocalMod[];
    },
    [fuse, data, sortType],
  );

  const results = useMemo(
    () => search(debouncedQuery),
    [search, debouncedQuery],
  );

  const setQuery = (newQuery: string) => {
    updateModsFilters({ searchQuery: newQuery });
  };

  const setSortType = (newSortType: SortType) => {
    updateModsFilters({ currentSort: newSortType });
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
