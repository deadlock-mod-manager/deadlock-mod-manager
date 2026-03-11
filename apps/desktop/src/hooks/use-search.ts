import Fuse, { type FuseOptionKey } from "fuse.js";
import { useCallback, useMemo } from "react";
import type { ModDto } from "@deadlock-mods/shared";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { SortType } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import { sortMods } from "@/lib/utils";

type UseSearchProps<T extends ModDto> = {
  data: T[];
  keys: FuseOptionKey<T>[];
};

export const useSearch = <T extends ModDto = ModDto>({ data, keys }: UseSearchProps<T>) => {
  const modsFilters = usePersistedStore((state) => state.modsFilters);
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );
  const query = modsFilters.searchQuery || "";
  const debouncedQuery = useDebouncedValue(query, 300);
  const sortType = modsFilters.currentSort;

  const fuse = useMemo(
    () =>
      new Fuse(data, {
        keys,
        shouldSort: true,
        useExtendedSearch: true,
      }),
    [data, keys],
  );

  const search = useCallback(
    (q: string) => {
      if (!q || !q.trim()) {
        return sortMods(data, sortType);
      }
      const results = fuse.search(q);
      return sortMods(results.map((result) => result.item), sortType);
    },
    [fuse, data, sortType],
  );

  const results = useMemo(
    () => search(debouncedQuery),
    [search, debouncedQuery],
  );

  const setQuery = useCallback((newQuery: string) => {
    updateModsFilters({ searchQuery: newQuery });
  }, [updateModsFilters]);

  const setSortType = useCallback((newSortType: SortType) => {
    updateModsFilters({ currentSort: newSortType });
  }, [updateModsFilters]);

  return {
    search,
    query,
    setQuery,
    results,
    sortType,
    setSortType,
  };
};
