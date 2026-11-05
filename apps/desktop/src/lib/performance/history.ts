import {
  isConfigHistoryEntry,
  type PerfHistoryEntry,
  type UserPerfConfig,
} from "@/lib/store/slices/performance";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PerfConfigSource } from "@/types/generated/PerfConfigSource";
import type { VideoChange } from "@/types/generated/VideoChange";
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
  writeVideo: request.writeVideo,
  videoVariant: request.videoVariant,
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
 * What "Undo last change" goes back to: the state before the newest config
 * entry in History (video.txt-only entries don't count). Nothing to undo when
 * History doesn't describe the current state (the config changed outside it),
 * when the only entry is a removal, or when the config to go back to was
 * deleted.
 */
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

/**
 * Video.txt changes made outside the app that History doesn't show yet: ones
 * not logged since the last apply, removal or restore, or since the player
 * kept or reverted that setting. A setting changed back and forth logs again.
 */
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
