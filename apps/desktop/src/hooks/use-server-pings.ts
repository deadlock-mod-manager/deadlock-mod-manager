import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { pingServers } from "@/lib/tauri-commands";

const PING_REFETCH_INTERVAL_MS = 15_000;

const getServerAddress = (server: ServerBrowserEntry): string | null => {
  if (!server.ip || server.port < 1) return null;
  const host = server.ip.includes(":") ? `[${server.ip}]` : server.ip;
  return `${host}:${server.port}`;
};

export const useServerPings = (servers: ServerBrowserEntry[]) => {
  const targets = useMemo(
    () =>
      servers.flatMap((server) => {
        const address = getServerAddress(server);
        return address ? [{ id: server.id, address }] : [];
      }),
    [servers],
  );

  const query = useQuery({
    queryKey: ["servers", "pings", targets],
    queryFn: () => pingServers(targets),
    enabled: targets.length > 0,
    refetchInterval: PING_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    meta: { skipGlobalErrorHandler: true },
  });

  const pings = useMemo(() => {
    const values: Partial<Record<string, number | null>> = {};
    for (const server of servers) {
      if (!getServerAddress(server)) values[server.id] = null;
    }
    if (query.isError) {
      for (const target of targets) values[target.id] = null;
      return values;
    }
    for (const result of query.data ?? []) {
      values[result.id] = result.latencyMs;
    }
    return values;
  }, [query.data, query.isError, servers, targets]);

  return { pings, query };
};
