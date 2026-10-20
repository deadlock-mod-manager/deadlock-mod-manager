import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo } from "react";
import type { ServerFiltersValue } from "@/components/server-browser/server-filters";
import { getServerFacets, getServers } from "@/lib/api-client";
import { useServerPings } from "./use-server-pings";

const SERVERS_REFETCH_INTERVAL_MS = 15_000;
const FACETS_REFETCH_INTERVAL_MS = 60_000;

export const useServerBrowserData = (filters: ServerFiltersValue) => {
  const deferredSearch = useDeferredValue(filters.search);

  const queryFilters = useMemo(
    () => ({
      search: deferredSearch || undefined,
      has_players: filters.hasPlayers || undefined,
      password:
        filters.password === "all"
          ? undefined
          : filters.password === "password",
      game_mode: filters.gameMode || undefined,
      region: filters.region || undefined,
      limit: 200,
    }),
    [
      deferredSearch,
      filters.hasPlayers,
      filters.password,
      filters.gameMode,
      filters.region,
    ],
  );

  const serversQuery = useQuery({
    queryKey: ["servers", "list", queryFilters],
    queryFn: () => getServers(queryFilters),
    refetchInterval: SERVERS_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  const facetsQuery = useQuery({
    queryKey: ["servers", "facets"],
    queryFn: getServerFacets,
    refetchInterval: FACETS_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  const rawServers = serversQuery.data?.servers ?? [];
  const { pings, query: pingsQuery } = useServerPings(rawServers);
  const facets = facetsQuery.data;

  const isJoinablePreset =
    filters.password === "open" && filters.hasPlayers === true;

  const servers = useMemo(() => {
    if (!isJoinablePreset) return rawServers;
    return rawServers.filter((s) => s.player_count < s.max_players);
  }, [rawServers, isJoinablePreset]);

  const availableGameModes = facets?.game_modes ?? [];
  const availableRegions = facets?.regions ?? [];

  const registryDegraded = serversQuery.data?.registry_degraded ?? false;
  const registrySnapshotAgeMs =
    serversQuery.data?.registry_snapshot_age_ms ?? null;

  return {
    servers,
    total: servers.length,
    availableGameModes,
    availableRegions,
    serversQuery,
    facetsQuery,
    pings,
    pingsQuery,
    registryDegraded,
    registrySnapshotAgeMs,
  };
};
