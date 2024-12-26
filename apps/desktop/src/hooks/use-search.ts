import { SortType } from '@/lib/constants';
import { sortMods } from '@/lib/utils';
import { LocalMod } from '@/types/mods';
import Fuse, { FuseOptionKey } from 'fuse.js';
import { useMemo, useState } from 'react';

interface UseSearchProps<T> {
  data: T[];
  keys: (keyof T)[];
}

export const useSearch = <T = LocalMod>({ data, keys }: UseSearchProps<T>) => {
  const [query, setQuery] = useState('');
  const [sortType, setSortType] = useState(SortType.DEFAULT);
  const fuse = useMemo(() => new Fuse(data, { keys: keys as FuseOptionKey<T>[] }), [data, keys]);

  const search = (query: string) => {
    if (!query) return sortMods(data as LocalMod[], sortType);
    const results = fuse.search(query);
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
