import type {
  FileserverDto,
  FileserverLatencyResult,
} from "@deadlock-mods/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";
import { getGameBananaFileservers } from "@/lib/api";
import { buildGameBananaFileserverTestUrl } from "@/lib/download/fileserver";
import { STALE_TIME_LOCAL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import type { FileserverPreference } from "@/lib/store/slices/network";

const STATE_ORDER: Record<string, number> = {
  up: 0,
  down: 1,
  terminated: 2,
};

export const useFileservers = () => {
  const fileserverPreference = usePersistedStore((s) => s.fileserverPreference);
  const setFileserverPreference = usePersistedStore(
    (s) => s.setFileserverPreference,
  );
  const setFileserverLatencyMs = usePersistedStore(
    (s) => s.setFileserverLatencyMs,
  );
  const fileserverLatencyMs = usePersistedStore((s) => s.fileserverLatencyMs);

  const {
    data: servers = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["fileservers", "gamebanana"],
    queryFn: getGameBananaFileservers,
    staleTime: STALE_TIME_LOCAL,
  });

  const latencyMutation = useMutation({
    mutationFn: async (list: FileserverDto[]) => {
      const results = await invoke<FileserverLatencyResult[]>(
        "test_fileserver_latency",
        {
          servers: list.map((s) => ({
            id: s.id,
            testUrl: buildGameBananaFileserverTestUrl(s.domain),
          })),
        },
      );
      return results;
    },
    onSuccess: (results) => {
      const next: Record<string, number> = { ...fileserverLatencyMs };
      for (const r of results) {
        if (r.reachable && r.latencyMs !== null) {
          next[r.id] = r.latencyMs;
        }
      }
      setFileserverLatencyMs(next);
    },
  });

  const sortedServers = useMemo(() => {
    return [...servers].sort((a, b) => {
      const sa = STATE_ORDER[a.state] ?? 1;
      const sb = STATE_ORDER[b.state] ?? 1;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });
  }, [servers]);

  const effectivePreference: FileserverPreference = useMemo(() => {
    if (fileserverPreference === "default" || fileserverPreference === "auto") {
      return fileserverPreference;
    }
    if (
      sortedServers.length > 0 &&
      !sortedServers.some((s) => s.id === fileserverPreference)
    ) {
      return "default";
    }
    return fileserverPreference;
  }, [sortedServers, fileserverPreference]);

  const select = (value: FileserverPreference) => {
    setFileserverPreference(value);
  };

  return {
    effectivePreference,
    fileserverLatencyMs,
    isPending,
    isError,
    latencyMutation,
    refetch,
    select,
    sortedServers,
  };
};
