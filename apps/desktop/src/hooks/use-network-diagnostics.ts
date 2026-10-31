import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { useState } from "react";
import { BASE_URL } from "@/lib/api-client";
import { ASSETS_BASE_URL } from "@/lib/deadlock-api";
import { fetch } from "@/lib/fetch";
import { inspectGameBananaCatalog } from "@/lib/gamebanana-catalog";
import logger from "@/lib/logger";
import {
  createPendingResults,
  type NetworkCheckResult,
  type NetworkDiagnosticsDeps,
  runNetworkDiagnostics,
  summarizeNetworkDiagnostics,
} from "@/lib/network-diagnostics";
import { runtimeServiceOrigin } from "@/lib/runtime-bootstrap";
import { usePersistedStore } from "@/lib/store";
import type { TcpAutoTuningLevel } from "@/types/generated/TcpAutoTuningLevel";

// Cloudflare's trace endpoint is tiny and answers on both a bare IP and a
// hostname, which lets a DNS failure be told apart from no connectivity at all.
const INTERNET_ORIGIN = "https://1.1.1.1";
const DNS_ORIGIN = "https://www.cloudflare.com";
const GAMEBANANA_ORIGIN = "https://gamebanana.com";
const DEADLOCK_API_ORIGIN = "https://api.deadlock-api.com";

const createDeps = (): NetworkDiagnosticsDeps => ({
  fetch: (url, init) => fetch(url, init),
  isOnline: () => navigator.onLine,
  inspectCatalog: inspectGameBananaCatalog,
  readTcpAutoTuning:
    platform() === "windows"
      ? () => invoke<TcpAutoTuningLevel | null>("get_tcp_autotuning_level")
      : undefined,
  proxyEnabled: usePersistedStore.getState().proxyConfig.enabled,
  origins: {
    internet: runtimeServiceOrigin("connectivity", INTERNET_ORIGIN),
    dns: runtimeServiceOrigin("connectivity", DNS_ORIGIN),
    dmmApi: runtimeServiceOrigin("dmmApi", BASE_URL),
    gamebanana: runtimeServiceOrigin("gamebanana", GAMEBANANA_ORIGIN),
    deadlockApi: runtimeServiceOrigin("deadlockApi", DEADLOCK_API_ORIGIN),
    assets: runtimeServiceOrigin("assets", ASSETS_BASE_URL),
  },
});

export const useNetworkDiagnostics = () => {
  const [results, setResults] = useState<NetworkCheckResult[]>(() =>
    createPendingResults(createDeps()),
  );

  const run = useMutation({
    mutationKey: ["network-diagnostics"],
    mutationFn: () => {
      const deps = createDeps();
      setResults(createPendingResults(deps));
      return runNetworkDiagnostics(deps, setResults);
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (final) => {
      logger
        .withMetadata({
          results: final.map(({ id, status, message, params }) => ({
            id,
            status,
            message,
            params,
          })),
        })
        .info("Network diagnostics finished");
    },
  });

  return {
    results,
    verdict: summarizeNetworkDiagnostics(results),
    isRunning: run.isPending,
    run: () => {
      if (!run.isPending) run.mutate();
    },
  };
};
