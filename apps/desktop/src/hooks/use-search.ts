import Fuse, { type FuseOptionKey } from "fuse.js";
import { useCallback, useMemo, useRef } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { SortType } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import { sortMods } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

const FUSE_MOD_SEARCH_THRESHOLD = 0.35;

type UseSearchProps<T> = {
  data: T[];
  keys: FuseOptionKey<T>[];
};

export const useSearch = <T = LocalMod>({ data, keys }: UseSearchProps<T>) => {
  const modsFilters = usePersistedStore((state) => state.modsFilters);
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );
  const query = modsFilters.searchQuery || "";
  const debouncedQuery = useDebouncedValue(query, 300);
  const sortType = modsFilters.currentSort;
  const preSearchSortRef = useRef<SortType | null>(null);

  const fuse = useMemo(
    () =>
      new Fuse(data, {
        keys,
        threshold: FUSE_MOD_SEARCH_THRESHOLD,
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
      const results = fuse.search(q).map((result) => result.item) as LocalMod[];
      // DEFAULT sort preserves Fuse.js relevance order during search
      if (sortType === SortType.DEFAULT) {
        return results;
      }
      return sortMods(results, sortType);
    },
    [fuse, data, sortType],
  );

  const results = useMemo(
    () => search(debouncedQuery),
    [search, debouncedQuery],
  );

  const setQuery = (newQuery: string) => {
    const trimmed = newQuery.trim();
    if (trimmed && sortType !== SortType.DEFAULT) {
      preSearchSortRef.current = sortType;
      updateModsFilters({
        searchQuery: newQuery,
        currentSort: SortType.DEFAULT,
      });
    } else if (!trimmed && preSearchSortRef.current) {
      const restored = preSearchSortRef.current;
      preSearchSortRef.current = null;
      updateModsFilters({ searchQuery: newQuery, currentSort: restored });
    } else {
      updateModsFilters({ searchQuery: newQuery });
    }
  };

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
