import Fuse, { type FuseOptionKey } from 'fuse.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { SortType } from '@/lib/constants';
import { usePersistedStore } from '@/lib/store';
import { sortMods } from '@/lib/utils';
import type { LocalMod } from '@/types/mods';

type UseSearchProps<T> = {
  data: T[];
  keys: (keyof T)[];
};

export const useSearch = <T = LocalMod>({ data, keys }: UseSearchProps<T>) => {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const defaultSort = usePersistedStore((state) => state.defaultSort);
  const [sortType, setSortType] = useState<SortType>(defaultSort);

  useEffect(() => {
    setSortType(defaultSort);
  }, [defaultSort]);

  const fuse = useMemo(
    () =>
      new Fuse(data, {
        keys: keys as FuseOptionKey<T>[],
        shouldSort: true,
        useExtendedSearch: true,
      }),
    [data, keys]
  );

  const search = useCallback(
    (q: string) => {
      if (!q.trim()) {
        return sortMods(data as LocalMod[], sortType);
      }
      const results = fuse.search(q);
      return results.map((result) => result.item) as LocalMod[];
    },
    [fuse, data, sortType]
  );

  const results = useMemo(
    () => search(debouncedQuery),
    [search, debouncedQuery]
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
