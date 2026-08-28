import type { FuseOptionKey } from "fuse.js";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { SortType } from "@/lib/constants";
import {
  FuseIndexCache,
  LatestTaskScheduler,
  searchFuseIndex,
} from "@/lib/search-runtime";
import { usePersistedStore } from "@/lib/store";
import { sortMods, type SortableMod } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

type UseSearchProps<T extends SortableMod> = {
  data: T[];
  keys: FuseOptionKey<T>[];
  queryState?: {
    query: string;
    setQuery: (query: string) => void;
    sortType: SortType;
    setSortType: (sortType: SortType) => void;
  };
};

export const useSearch = <T extends SortableMod = LocalMod>({
  data,
  keys,
  queryState,
}: UseSearchProps<T>) => {
  const modsFilters = usePersistedStore((state) => state.modsFilters);
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );
  const query = queryState?.query ?? modsFilters.searchQuery ?? "";
  const sortType = queryState?.sortType ?? modsFilters.currentSort;
  const preSearchSortRef = useRef<SortType | null>(null);
  const indexCacheRef = useRef<FuseIndexCache<T> | null>(null);
  const schedulerRef = useRef<LatestTaskScheduler | null>(null);

  if (!indexCacheRef.current) {
    indexCacheRef.current = new FuseIndexCache<T>();
  }
  if (!schedulerRef.current) {
    schedulerRef.current = new LatestTaskScheduler(
      (task) => window.requestAnimationFrame(task),
      (handle) => window.cancelAnimationFrame(handle),
    );
  }
  const fuse = indexCacheRef.current.get(data, keys);

  const search = useCallback(
    (q: string) => {
      if (!q || !q.trim()) {
        return sortMods(data, sortType);
      }
      const results = searchFuseIndex(fuse, data, q);
      // DEFAULT sort preserves Fuse.js relevance order during search
      if (sortType === SortType.DEFAULT) {
        return results;
      }
      return sortMods(results, sortType);
    },
    [fuse, data, sortType],
  );

  const [results, setResults] = useState(() => search(query));

  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) return;
    scheduler.schedule(
      () => search(query),
      (nextResults) => {
        startTransition(() => setResults(nextResults));
      },
    );
    return () => scheduler.cancel();
  }, [query, search]);

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
