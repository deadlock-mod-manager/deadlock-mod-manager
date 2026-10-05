import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { checkModUpdates } from "@/lib/api-client";
import { fileIdFromDownloadUrl } from "@/lib/mod-interchange";
import {
  REFETCH_INTERVAL_MOD_UPDATES,
  STALE_TIME_API,
} from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import type { State } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";

type CheckUpdatesData = Awaited<ReturnType<typeof checkModUpdates>>;
type ModUpdate = CheckUpdatesData["updates"][number];
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

const selectModsToCheck = (state: State) => {
  if (state.localMods !== lastLocalMods) {
    lastLocalMods = state.localMods;
    lastModsToCheck = state.localMods
      .filter(
        (mod) =>
          mod.status === ModStatus.Installed &&
          mod.remoteId &&
          !mod.remoteId.startsWith("local-"),
      )
      .map(toModToCheck);
  }
  return lastModsToCheck;
};

const isSkipped = (update: ModUpdate, localMod: LocalMod | undefined) =>
  localMod?.skippedUpdateAt !== undefined &&
  update.updatedAt <= localMod.skippedUpdateAt;

const withoutSkipped = (updates: ModUpdate[], localMods: LocalMod[]) =>
  updates.filter(
    (update) =>
      !isSkipped(
        update,
        localMods.find((mod) => mod.remoteId === update.mod.remoteId),
      ),
  );

const useModUpdatesQuery = () => {
  const modsToCheck = usePersistedStore(useShallow(selectModsToCheck));

  return useQuery({
    queryKey: ["check-mod-updates", modsToCheck],
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
  if (!localMod || localMod.status !== ModStatus.Installed) return false;
  return (
    data?.updates.some(
      (update) =>
        update.mod.remoteId === localMod.remoteId &&
        !isSkipped(update, localMod),
    ) ?? false
  );
};

export const useCheckUpdates = (options?: {
  onSuccess?: (data: CheckUpdatesData) => void;
  onError?: (error: Error) => void;
}) => {
  const localMods = usePersistedStore((state) => state.localMods);
  const query = useModUpdatesQuery();

  const updatableMods = useMemo(
    () => withoutSkipped(query.data?.updates ?? [], localMods),
    [query.data, localMods],
  );

  const refetch = useCallback(async () => {
    const result = await query.refetch();
    if (result.isError && result.error && options?.onError) {
      options.onError(result.error);
    } else if (!result.isError && result.data && options?.onSuccess) {
      options.onSuccess({
        ...result.data,
        updates: withoutSkipped(
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
