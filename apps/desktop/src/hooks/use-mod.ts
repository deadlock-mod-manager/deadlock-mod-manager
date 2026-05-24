import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMod } from "@/lib/api-client";
import {
  findModInModsListCache,
  modDetailQueryKey,
} from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";

interface UseModOptions {
  enabled?: boolean;
  retry?: number;
}

export const useMod = (
  modId: string | undefined,
  options: UseModOptions = {},
) => {
  const { enabled = true, retry = 1 } = options;
  const queryClient = useQueryClient();
  const isLocal = modId?.includes("local") ?? false;
  const localMod = usePersistedStore((state) =>
    modId ? state.localMods.find((m) => m.remoteId === modId) : undefined,
  );

  const query = useQuery({
    queryKey: modDetailQueryKey(modId ?? ""),
    queryFn: () => {
      if (!modId) {
        throw new Error("Mod ID is required");
      }
      return getMod(modId);
    },
    enabled: !!modId && !isLocal && enabled,
    retry,
    staleTime: STALE_TIME_API,
    placeholderData: () => {
      if (!modId || isLocal) {
        return undefined;
      }
      return (
        findModInModsListCache(queryClient, modId) ?? localMod ?? undefined
      );
    },
    throwOnError: false,
  });

  if (isLocal) {
    return {
      ...query,
      data: localMod,
      mod: localMod,
      isLoading: false,
      error: null,
      isPlaceholderData: false,
    };
  }

  return {
    ...query,
    mod: query.data,
    isPlaceholderData: query.isPlaceholderData,
  };
};
