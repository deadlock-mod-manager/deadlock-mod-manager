import { SortType } from '@/lib/constants';
import { usePersistedStore } from '@/lib/store';
import { sortMods } from '@/lib/utils';
import { LocalMod } from '@/types/mods';
import Fuse, { FuseOptionKey } from 'fuse.js';
import { useEffect, useMemo, useState } from 'react';

interface UseSearchProps<T> {
  data: T[];
  keys: (keyof T)[];
}

export const useSearch = <T = LocalMod>({ data, keys }: UseSearchProps<T>) => {
  const [query, setQuery] = useState('');
  const defaultSort = usePersistedStore((state) => state.defaultSort);
  const [sortType, setSortType] = useState<SortType>(defaultSort);

  useEffect(() => {
    setSortType(defaultSort);
  }, [defaultSort]);

  const fuse = useMemo(() => new Fuse(data, { keys: keys as FuseOptionKey<T>[] }), [data, keys]);

  const search = (q: string) => {
    if (!q) return sortMods(data as LocalMod[], sortType);
    const results = fuse.search(q);
    return sortMods(results.map((result) => result.item) as LocalMod[], sortType);
  };

  return {
    search,
    query,
    setQuery,
    results: search(query),
    sortType,
    setSortType
  };
};
