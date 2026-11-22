import {
  isConfigHistoryEntry,
  type PerfHistoryEntry,
  type UserPerfConfig,
} from "@/lib/store/slices/performance";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PerfConfigSource } from "@/types/generated/PerfConfigSource";
import type { VideoChange } from "@/types/generated/VideoChange";
import { userConfigApplyRequest } from "./request";

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
  writeVideo: request.writeVideo,
  videoVariant: request.videoVariant,
});

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

export const undoTarget = (
  history: PerfHistoryEntry[],
  currentConfigId: string | null,
  userConfigs: Record<string, UserPerfConfig>,
): UndoTarget | null => {
  const [latest, previous] = history.filter(isConfigHistoryEntry);
  if (!latest || latest.configId !== currentConfigId) return null;
  if (previous?.action === "applied" && previous.request) {
    const request = historyApplyRequest(previous.request, userConfigs);
    return request ? { kind: "apply", request } : null;
  }
  return latest.action === "applied" ? { kind: "remove" } : null;
};

export const unloggedVideoChanges = (
  history: PerfHistoryEntry[],
  changes: VideoChange[],
): VideoChange[] => {
  const logged = new Set<string>();
  const settled = new Set<string>();
  for (const entry of history) {
    if (entry.action === "videoKept" || entry.action === "videoReverted") {
      for (const key of entry.keys) settled.add(key.toLowerCase());
      continue;
    }
    if (entry.action !== "videoChanged") break;
    for (const change of entry.changes) {
      if (!settled.has(change.key.toLowerCase())) logged.add(changeKey(change));
    }
  }
  return changes.filter((change) => !logged.has(changeKey(change)));
};

const changeKey = ({ key, current }: Pick<VideoChange, "key" | "current">) =>
  `${key.toLowerCase()}=${current ?? ""}`;
