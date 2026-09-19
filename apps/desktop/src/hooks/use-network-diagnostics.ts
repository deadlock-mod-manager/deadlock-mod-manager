import { useMutation } from "@tanstack/react-query";
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

const GAMEBANANA_ORIGIN = "https://gamebanana.com";
const DEADLOCK_API_ORIGIN = "https://api.deadlock-api.com";

const createDeps = (): NetworkDiagnosticsDeps => ({
  fetch: (url, init) => fetch(url, init),
  isOnline: () => navigator.onLine,
  inspectCatalog: inspectGameBananaCatalog,
  proxyEnabled: usePersistedStore.getState().proxyConfig.enabled,
  origins: {
    dmmApi: runtimeServiceOrigin("dmmApi", BASE_URL),
    gamebanana: runtimeServiceOrigin("gamebanana", GAMEBANANA_ORIGIN),
    deadlockApi: runtimeServiceOrigin("deadlockApi", DEADLOCK_API_ORIGIN),
    assets: runtimeServiceOrigin("assets", ASSETS_BASE_URL),
  },
});

export const useNetworkDiagnostics = () => {
  const [results, setResults] =
    useState<NetworkCheckResult[]>(createPendingResults);

  const run = useMutation({
    mutationKey: ["network-diagnostics"],
    mutationFn: () => {
      setResults(createPendingResults());
      return runNetworkDiagnostics(createDeps(), setResults);
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
