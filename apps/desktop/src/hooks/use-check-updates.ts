import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { shallow } from "zustand/shallow";
import { checkModUpdates } from "@/lib/api-client";
import { fileIdFromDownloadUrl } from "@/lib/mod-interchange";
import {
  REFETCH_INTERVAL_MOD_UPDATES,
  STALE_TIME_API,
} from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import type { State } from "@/lib/store";
import {
  canCheckModUpdates,
  isModUpdateSkipped,
  availableModUpdates,
} from "@/lib/mods/mod-updates";
import { type LocalMod } from "@/types/mods";

type CheckUpdatesData = Awaited<ReturnType<typeof checkModUpdates>>;
type ModToCheck = Parameters<typeof checkModUpdates>[0][number];

// Reuse entries per mod object so the shallow selector stays stable until a mod changes.
const modsToCheckCache = new WeakMap<LocalMod, ModToCheck>();

const toModToCheck = (mod: LocalMod): ModToCheck => {
  const cached = modsToCheckCache.get(mod);
  if (cached) return cached;
  const entry = {
    remoteId: mod.remoteId,
    installedAt:
      mod.downloadedAt ??
      mod.selectedDownloads?.[0]?.createdAt ??
      mod.createdAt ??
      new Date(0),
    selectedFileIds:
      mod.selectedDownloads?.flatMap((download) => {
        const id = fileIdFromDownloadUrl(download.url);
        return id === null ? [] : [String(id)];
      }) ?? [],
  };
  modsToCheckCache.set(mod, entry);
  return entry;
};

// Every mod card subscribes, so derive once per localMods change.
let lastLocalMods: LocalMod[] | undefined;
let lastModsToCheck: ModToCheck[] = [];
// Stands in for the list in the query key. Every card observes this query, and React Query
// hashes the key on each observer render, so keying on the whole list cost O(n) per card.
let modsToCheckRevision = 0;

const selectModsToCheck = (state: State) => {
  if (state.localMods !== lastLocalMods) {
    lastLocalMods = state.localMods;
    const next = state.localMods.filter(canCheckModUpdates).map(toModToCheck);
    if (!shallow(next, lastModsToCheck)) {
      lastModsToCheck = next;
      modsToCheckRevision++;
    }
  }
  return lastModsToCheck;
};

type ModUpdate = CheckUpdatesData["updates"][number];

// Grouped once per result so each card looks its mod up instead of scanning every update.
const updatesByRemoteId = new WeakMap<
  CheckUpdatesData,
  Map<string, ModUpdate[]>
>();

const getUpdatesByRemoteId = (data: CheckUpdatesData) => {
  let byId = updatesByRemoteId.get(data);
  if (!byId) {
    byId = new Map();
    for (const update of data.updates) {
      const forMod = byId.get(update.mod.remoteId);
      if (forMod) forMod.push(update);
      else byId.set(update.mod.remoteId, [update]);
    }
    updatesByRemoteId.set(data, byId);
  }
  return byId;
};

const useModUpdatesQuery = () => {
  const modsToCheck = usePersistedStore(useShallow(selectModsToCheck));

  return useQuery({
    queryKey: ["check-mod-updates", modsToCheckRevision],
    queryFn: () => checkModUpdates(modsToCheck),
    enabled: modsToCheck.length > 0,
    staleTime: STALE_TIME_API,
    refetchInterval: REFETCH_INTERVAL_MOD_UPDATES,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useModHasUpdate = (localMod: LocalMod | undefined) => {
  const { data } = useModUpdatesQuery();
  if (!data || !localMod || !canCheckModUpdates(localMod)) return false;
  return (
    getUpdatesByRemoteId(data)
      .get(localMod.remoteId)
      ?.some((update) => !isModUpdateSkipped(update, localMod)) ?? false
  );
};

export const useCheckUpdates = (options?: {
  onSuccess?: (data: CheckUpdatesData) => void;
  onError?: (error: Error) => void;
}) => {
  const localMods = usePersistedStore((state) => state.localMods);
  const query = useModUpdatesQuery();

  const updatableMods = useMemo(
    () => availableModUpdates(query.data?.updates ?? [], localMods),
    [query.data, localMods],
  );

  const refetch = useCallback(async () => {
    const result = await query.refetch();
    if (result.isError && result.error && options?.onError) {
      options.onError(result.error);
    } else if (!result.isError && result.data && options?.onSuccess) {
      options.onSuccess({
        ...result.data,
        updates: availableModUpdates(
          result.data.updates,
          usePersistedStore.getState().localMods,
        ),
      });
    }
    return result;
  }, [query.refetch, options?.onSuccess, options?.onError]);

  return {
    updatableMods,
    updatableCount: updatableMods.length,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch,
  };
};
