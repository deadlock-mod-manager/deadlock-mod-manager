import type { ModDto } from "@deadlock-mods/shared";
import type { QueryClient } from "@tanstack/react-query";

export const MODS_LIST_QUERY_KEY = ["mods"] as const;

export const modDetailQueryKey = (remoteId: string) =>
  ["mod", remoteId] as const;

type CachedModList =
  | ModDto[]
  | { items: ModDto[] }
  | { pages: Array<{ items: ModDto[] }> };

const cachedMods = (data: CachedModList | undefined): ModDto[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if ("pages" in data) return data.pages.flatMap((page) => page.items);
  return data.items;
};

/**
 * Looks a mod up in any cached list under `MODS_LIST_QUERY_KEY` (store pages,
 * dashboard, favorites) so detail views can render before their own fetch.
 */
export const findModInModsListCache = (
  queryClient: QueryClient,
  remoteId: string,
): ModDto | undefined => {
  for (const [, data] of queryClient.getQueriesData<CachedModList>({
    queryKey: MODS_LIST_QUERY_KEY,
  })) {
    const mod = cachedMods(data).find((entry) => entry.remoteId === remoteId);
    if (mod) return mod;
  }
  return undefined;
};
