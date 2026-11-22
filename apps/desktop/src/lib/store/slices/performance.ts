import type { StateCreator } from "zustand";
import {
  compactHistoryRequest,
  type PerfHistoryRequest,
} from "@/lib/performance/history";
import type { ConfigEntry } from "@/types/generated/ConfigEntry";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { ImportFormat } from "@/types/generated/ImportFormat";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { VideoChange } from "@/types/generated/VideoChange";
import type { VideoSetting } from "@/types/generated/VideoSetting";
import type { State } from "..";

const MAX_HISTORY_SIZE = 30;

export type UserPerfConfigOrigin =
  | { kind: "paste"; format: ImportFormat }
  | { kind: "file"; fileName: string | null; format: ImportFormat }
  | {
      kind: "gamebanana";
      gamebananaId: number;
      fileId: number;
      variant: string | null;
    }
  | { kind: "currentGameinfo" }
  | {
      kind: "modDownload";
      modId: string;
      modName: string;
      variant: string | null;
    }
  | { kind: "shareCode"; presetId: string | null }
  | { kind: "fork"; fromConfigId: string };

export type PerfVideoChoice = {
  write: boolean;
  variant: string | null;
};

export type UserPerfConfig = {
  id: string;
  name: string;
  createdAt: string;
  origin: UserPerfConfigOrigin;
  entries: ConfigEntry[];
  videoSettings: VideoSetting[];
  baseBuild: number | null;
};

export type PerfConfigHistoryEntry = {
  id: string;
  at: string;
  action: "applied" | "removed";
  configId: string | null;
  name: string | null;
  request: PerfHistoryRequest | null;
  appliedCount: number | null;
  videoCount: number | null;
};

type PerfVideoHistoryChange = Omit<VideoChange, "kept"> & {
  label: string | null;
};

type PerfVideoHistoryEntry =
  | { id: string; at: string; action: "videoRestored" | "videoAdopted" }
  | {
      id: string;
      at: string;
      action: "videoChanged";
      changes: PerfVideoHistoryChange[];
    }
  | {
      id: string;
      at: string;
      action: "videoReverted" | "videoKept";
      keys: string[];
    };

export type PerfHistoryEntry = PerfConfigHistoryEntry | PerfVideoHistoryEntry;

type Unstamped<T extends PerfVideoHistoryEntry> =
  T extends PerfVideoHistoryEntry ? Omit<T, "id" | "at"> : never;

type NewPerfHistoryEntry =
  | (Omit<PerfConfigHistoryEntry, "id" | "at" | "request"> & {
      request: PerfApplyRequest | null;
    })
  | Unstamped<PerfVideoHistoryEntry>;

export const isConfigHistoryEntry = (
  entry: PerfHistoryEntry,
): entry is PerfConfigHistoryEntry =>
  entry.action === "applied" || entry.action === "removed";

export type PerformanceState = {
  perfUserConfigs: Record<string, UserPerfConfig>;
  perfOverrides: Record<string, EntryOverride[]>;
  perfIncludeEngineSections: Record<string, boolean>;
  perfVideoChoices: Record<string, PerfVideoChoice>;
  perfHistory: PerfHistoryEntry[];
  perfDismissedModConfigs: Record<string, true>;
  addUserPerfConfig: (config: UserPerfConfig) => void;
  renameUserPerfConfig: (id: string, name: string) => void;
  removeUserPerfConfig: (id: string) => void;
  setPerfOverrides: (configId: string, overrides: EntryOverride[]) => void;
  setPerfIncludeEngineSections: (configId: string, include: boolean) => void;
  setPerfVideoChoice: (configId: string, choice: PerfVideoChoice) => void;
  recordPerfHistory: (entry: NewPerfHistoryEntry) => void;
  dismissModConfig: (modId: string) => void;
};

export const performanceDeepMergeKeys =
  [] as const satisfies readonly (keyof PerformanceState)[];

export const createPerformanceSlice: StateCreator<
  State,
  [],
  [],
  PerformanceState
> = (set) => ({
  perfUserConfigs: {},
  perfOverrides: {},
  perfIncludeEngineSections: {},
  perfVideoChoices: {},
  perfHistory: [],
  perfDismissedModConfigs: {},
  addUserPerfConfig: (config) =>
    set((state) => ({
      perfUserConfigs: { ...state.perfUserConfigs, [config.id]: config },
    })),
  renameUserPerfConfig: (id, name) =>
    set((state) => {
      const config = state.perfUserConfigs[id];
      if (!config) return {};
      return {
        perfUserConfigs: {
          ...state.perfUserConfigs,
          [id]: { ...config, name },
        },
      };
    }),
  removeUserPerfConfig: (id) =>
    set((state) => {
      const { [id]: _removed, ...perfUserConfigs } = state.perfUserConfigs;
      const { [id]: _overrides, ...perfOverrides } = state.perfOverrides;
      const { [id]: _include, ...perfIncludeEngineSections } =
        state.perfIncludeEngineSections;
      const { [id]: _video, ...perfVideoChoices } = state.perfVideoChoices;
      return {
        perfUserConfigs,
        perfOverrides,
        perfIncludeEngineSections,
        perfVideoChoices,
      };
    }),
  setPerfOverrides: (configId, overrides) =>
    set((state) => ({
      perfOverrides: { ...state.perfOverrides, [configId]: overrides },
    })),
  setPerfIncludeEngineSections: (configId, include) =>
    set((state) => ({
      perfIncludeEngineSections: {
        ...state.perfIncludeEngineSections,
        [configId]: include,
      },
    })),
  setPerfVideoChoice: (configId, choice) =>
    set((state) => ({
      perfVideoChoices: { ...state.perfVideoChoices, [configId]: choice },
    })),
  recordPerfHistory: (entry) =>
    set((state) => {
      const stamp = { id: crypto.randomUUID(), at: new Date().toISOString() };
      const stored: PerfHistoryEntry =
        entry.action === "applied" || entry.action === "removed"
          ? {
              ...entry,
              ...stamp,
              request: entry.request && compactHistoryRequest(entry.request),
            }
          : { ...entry, ...stamp };
      return {
        perfHistory: [stored, ...state.perfHistory].slice(0, MAX_HISTORY_SIZE),
      };
    }),
  dismissModConfig: (modId) =>
    set((state) => ({
      perfDismissedModConfigs: {
        ...state.perfDismissedModConfigs,
        [modId]: true,
      },
    })),
});
