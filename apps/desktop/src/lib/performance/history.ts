import type {
  PerfHistoryEntry,
  UserPerfConfig,
} from "@/lib/store/slices/performance";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PerfConfigSource } from "@/types/generated/PerfConfigSource";
import { userConfigApplyRequest } from "./request";

/**
 * An applied request as History stores it. A user config's entries (often
 * hundreds) are left out; re-applying reads them from the config again.
 */
export type PerfHistoryRequest = Omit<PerfApplyRequest, "source"> & {
  source: Extract<PerfConfigSource, { kind: "preset" }> | { kind: "inline" };
};

export const compactHistoryRequest = (
  request: PerfApplyRequest,
): PerfHistoryRequest => ({
  configId: request.configId,
  name: request.name,
  source:
    request.source.kind === "preset" ? request.source : { kind: "inline" },
  overrides: request.overrides,
  includeEngineSections: request.includeEngineSections,
});

/** The request that re-applies a History entry, or `null` once its config was deleted. */
export const historyApplyRequest = (
  request: PerfHistoryRequest,
  userConfigs: Record<string, UserPerfConfig>,
): PerfApplyRequest | null => {
  if (request.source.kind === "preset") {
    return { ...request, source: request.source };
  }
  const config = userConfigs[request.configId];
  return config ? userConfigApplyRequest(config, request) : null;
};

type UndoTarget =
  | { kind: "apply"; request: PerfApplyRequest }
  | { kind: "remove" };

/**
 * What "Undo last change" goes back to: the state before the newest History
 * entry. Nothing to undo when History doesn't describe the current state (the
 * config changed outside it), when the only entry is a removal, or when the
 * config to go back to was deleted.
 */
export const undoTarget = (
  history: PerfHistoryEntry[],
  currentConfigId: string | null,
  userConfigs: Record<string, UserPerfConfig>,
): UndoTarget | null => {
  const [latest, previous] = history;
  if (!latest || latest.configId !== currentConfigId) return null;
  if (previous?.action === "applied" && previous.request) {
    const request = historyApplyRequest(previous.request, userConfigs);
    return request ? { kind: "apply", request } : null;
  }
  return latest.action === "applied" ? { kind: "remove" } : null;
};
