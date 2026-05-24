import type { ModDto } from "@deadlock-mods/shared";
import type { QueryClient } from "@tanstack/react-query";

export const MODS_LIST_QUERY_KEY = ["mods"] as const;

export const modDetailQueryKey = (remoteId: string) =>
  ["mod", remoteId] as const;

export const findModInModsListCache = (
  queryClient: QueryClient,
  remoteId: string,
): ModDto | undefined => {
  const mods = queryClient.getQueryData<ModDto[]>(MODS_LIST_QUERY_KEY);
  return mods?.find((mod) => mod.remoteId === remoteId);
};
