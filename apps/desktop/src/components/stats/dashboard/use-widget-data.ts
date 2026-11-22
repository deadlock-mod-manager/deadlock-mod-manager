import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { DeadlockApiError, requestJson } from "@/lib/stats/api";
import { cachedFetch, STATS_TTL } from "@/lib/stats/cache";
import {
  ApiQueryError,
  datasetFromResponse,
  resolveApiPath,
} from "@/lib/stats/dashboard/api-query";
import {
  DashboardSchemaError,
  defaultParams,
  type PresetQuery,
  presetById,
} from "@/lib/stats/dashboard/catalog";
import { type Dataset, missingFields } from "@/lib/stats/dashboard/dataset";
import type { WidgetSource, WidgetView } from "@/lib/stats/dashboard/layout";
import { runMatchQuery } from "@/lib/stats/dashboard/match-query";
import { HISTORY_ENDPOINT } from "@/lib/stats/dashboard/presets/kit";
import { useDashboardData } from "./dashboard-context";

type BrokenReason =
  /** The preset or panel id is gone from this version of the app. */
  | "unknownSource"
  /** The request failed with an HTTP status. */
  | "endpoint"
  /** The request never got an answer. */
  | "network"
  /** The response no longer has the shape the widget reads. */
  | "schema"
  /** Fields the chart was configured with are missing from the data. */
  | "fields"
  | "invalidPath"
  | "notAList";

export type WidgetDataState =
  | { status: "loading" }
  | { status: "needsAccount" }
  | { status: "empty" }
  | {
      status: "ready";
      dataset: Dataset;
      /** Served from the disk cache after a failed refresh. */
      isStale: boolean;
    }
  | {
      status: "broken";
      reason: BrokenReason;
      endpoint: string | null;
      httpStatus?: number;
      missing?: string[];
      retry?: () => void;
    };

type Plan =
  | { kind: "state"; state: WidgetDataState }
  | { kind: "dataset"; dataset: Dataset }
  | Extract<PresetQuery, { kind: "remote" }>;

const CUSTOM_API_TTL = 10 * 60 * 1000;

const brokenFrom = (
  error: Error | null,
  endpoint: string | null,
): Extract<WidgetDataState, { status: "broken" }> => {
  if (error instanceof DeadlockApiError) {
    return {
      status: "broken",
      reason: "endpoint",
      endpoint: error.endpoint.split("?")[0],
      httpStatus: error.status,
    };
  }
  if (error instanceof DashboardSchemaError) {
    return { status: "broken", reason: "schema", endpoint: error.endpoint };
  }
  if (error instanceof ApiQueryError) {
    return {
      status: "broken",
      reason: error.reason === "needsAccount" ? "invalidPath" : error.reason,
      endpoint,
    };
  }
  if (error?.name === "ZodError") {
    return { status: "broken", reason: "schema", endpoint };
  }
  return { status: "broken", reason: "network", endpoint };
};

/**
 * What stands between a widget and the shared match history: no account, the
 * history still loading, or its request having failed. `null` once it is there.
 */
export const useHistoryGate = (): WidgetDataState | null => {
  const { accountId, isAccountPending, stats } = useDashboardData();
  return useMemo((): WidgetDataState | null => {
    if (accountId === null) {
      return isAccountPending
        ? { status: "loading" }
        : { status: "needsAccount" };
    }
    if (stats.isPending) {
      return { status: "loading" };
    }
    if (stats.isError) {
      return {
        status: "broken",
        reason: "endpoint",
        endpoint: HISTORY_ENDPOINT,
      };
    }
    return null;
  }, [accountId, isAccountPending, stats.isPending, stats.isError]);
};

/**
 * Resolves a widget's source into a dataset, or into the reason it cannot show
 * one. Panels never come through here: they render their own components.
 */
export const useWidgetData = (
  source: WidgetSource,
  view: WidgetView | undefined,
): WidgetDataState => {
  const { accountId, stats } = useDashboardData();
  const matches = stats.matches;
  const allMatches = stats.allMatches;

  const historyState = useHistoryGate();

  const plan = useMemo((): Plan => {
    switch (source.kind) {
      case "panel":
        return {
          kind: "state",
          state: { status: "broken", reason: "unknownSource", endpoint: null },
        };
      case "matches":
        return historyState
          ? { kind: "state", state: historyState }
          : { kind: "dataset", dataset: runMatchQuery(matches, source.query) };
      case "preset": {
        const preset = presetById(source.preset);
        if (!preset) {
          return {
            kind: "state",
            state: {
              status: "broken",
              reason: "unknownSource",
              endpoint: null,
            },
          };
        }
        if (preset.needsAccount && accountId === null) {
          return { kind: "state", state: { status: "needsAccount" } };
        }
        if (preset.needsHistory && historyState) {
          return { kind: "state", state: historyState };
        }
        const query = preset.query(
          {
            accountId,
            matches:
              preset.endpoint === HISTORY_ENDPOINT ? matches : allMatches,
          },
          { ...defaultParams(preset), ...source.params },
        );
        return query.kind === "local"
          ? { kind: "dataset", dataset: query.build() }
          : query;
      }
      case "api": {
        let path: string;
        try {
          path = resolveApiPath(source.path, accountId);
        } catch (error) {
          if (
            error instanceof ApiQueryError &&
            error.reason === "needsAccount"
          ) {
            return { kind: "state", state: { status: "needsAccount" } };
          }
          return {
            kind: "state",
            state: {
              status: "broken",
              reason: "invalidPath",
              endpoint: source.path,
            },
          };
        }
        const playerScoped = source.path.includes("{account_id}");
        return {
          kind: "remote",
          cacheKey: `${playerScoped ? "player:" : ""}dashboard:api:${path}#${source.listPath}`,
          playerScoped,
          ttl: CUSTOM_API_TTL,
          endpoint: path.split("?")[0],
          load: async () =>
            datasetFromResponse(await requestJson(path), source.listPath),
        };
      }
    }
  }, [source, accountId, matches, allMatches, historyState]);

  const remotePlan = plan.kind === "remote" ? plan : null;
  const query = useQuery({
    queryKey: ["stats", remotePlan?.cacheKey ?? "dashboard:none"],
    queryFn: () => {
      if (!remotePlan) {
        throw new ApiQueryError("invalidPath");
      }
      return cachedFetch(remotePlan.cacheKey, remotePlan.ttl, remotePlan.load);
    },
    enabled: remotePlan !== null,
    staleTime: remotePlan?.ttl ?? STATS_TTL.heroStats,
    gcTime: (remotePlan?.ttl ?? STATS_TTL.heroStats) * 2,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) =>
      failureCount < 1 &&
      !(error instanceof DashboardSchemaError) &&
      !(error instanceof ApiQueryError) &&
      !(error instanceof DeadlockApiError && error.status < 500),
    meta: { skipGlobalErrorHandler: true },
  });

  return useMemo((): WidgetDataState => {
    let dataset: Dataset;
    let isStale = false;
    if (plan.kind === "state") {
      return plan.state;
    }
    if (plan.kind === "dataset") {
      dataset = plan.dataset;
    } else {
      if (query.isError) {
        return {
          ...brokenFrom(query.error, plan.endpoint),
          retry: () => void query.refetch(),
        };
      }
      if (!query.data) {
        return { status: "loading" };
      }
      dataset = query.data.data;
      isStale = query.data.isStale;
    }

    if (dataset.rows.length === 0) {
      return { status: "empty" };
    }
    const missing = view
      ? missingFields(dataset, [view.x, ...view.y, view.sortBy])
      : [];
    if (missing.length > 0) {
      return {
        status: "broken",
        reason: "fields",
        endpoint: plan.kind === "remote" ? plan.endpoint : null,
        missing,
      };
    }
    return { status: "ready", dataset, isStale };
  }, [plan, query, view]);
};
