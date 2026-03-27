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
  queryState?: {
    query: string;
    setQuery: (query: string) => void;
    sortType: SortType;
    setSortType: (sortType: SortType) => void;
  };
};

export const useSearch = <T = LocalMod>({
  data,
  keys,
  queryState,
}: UseSearchProps<T>) => {
  const modsFilters = usePersistedStore((state) => state.modsFilters);
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );
  const query = queryState?.query ?? modsFilters.searchQuery ?? "";
  const debouncedQuery = useDebouncedValue(query, 300);
  const sortType = queryState?.sortType ?? modsFilters.currentSort;
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

    if (queryState) {
      if (trimmed && sortType !== SortType.DEFAULT) {
        preSearchSortRef.current = sortType;
        queryState.setSortType(SortType.DEFAULT);
        queryState.setQuery(newQuery);
        return;
      }

      if (!trimmed && preSearchSortRef.current) {
        const restored = preSearchSortRef.current;
        preSearchSortRef.current = null;
        queryState.setSortType(restored);
        queryState.setQuery(newQuery);
        return;
      }

      queryState.setQuery(newQuery);
      return;
    }

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

  const setSortType = useCallback(
    (newSortType: SortType) => {
      if (queryState) {
        queryState.setSortType(newSortType);
        return;
      }

      updateModsFilters({ currentSort: newSortType });
    },
    [queryState, updateModsFilters],
  );

  return {
    search,
    query,
    setQuery,
    results,
    sortType,
    setSortType,
  };
};
