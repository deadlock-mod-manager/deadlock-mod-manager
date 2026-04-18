import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo } from "react";
import type { ServerFiltersValue } from "@/components/server-browser/server-filters";
import { getRelaysHealth, getServerFacets, getServers } from "@/lib/api";

const SERVERS_REFETCH_INTERVAL_MS = 15_000;
const RELAYS_REFETCH_INTERVAL_MS = 30_000;
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

  const relaysQuery = useQuery({
    queryKey: ["servers", "relays", "health"],
    queryFn: getRelaysHealth,
    refetchInterval: RELAYS_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  const facetsQuery = useQuery({
    queryKey: ["servers", "facets"],
    queryFn: getServerFacets,
    refetchInterval: FACETS_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  const rawServers = serversQuery.data?.servers ?? [];
  const relays = relaysQuery.data?.relays ?? [];
  const facets = facetsQuery.data;

  const isJoinablePreset =
    filters.password === "open" && filters.hasPlayers === true;

  const servers = useMemo(() => {
    if (!isJoinablePreset) return rawServers;
    return rawServers.filter((s) => s.player_count < s.max_players);
  }, [rawServers, isJoinablePreset]);

  const availableGameModes = facets?.game_modes ?? [];
  const availableRegions =
    facets?.regions ??
    Array.from(
      new Set(
        relays
          .map((r) => (r.region ?? "").trim().toLowerCase())
          .filter((r) => r.length > 0),
      ),
    ).sort();

  const allRelaysFailed =
    !!serversQuery.data &&
    serversQuery.data.relays_failed > 0 &&
    serversQuery.data.relays_queried === 0;

  return {
    servers,
    total: servers.length,
    relays,
    availableGameModes,
    availableRegions,
    serversQuery,
    relaysQuery,
    facetsQuery,
    allRelaysFailed,
  };
};
