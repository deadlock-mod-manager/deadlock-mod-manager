import type { StateCreator } from "zustand";
import {
  compactHistoryRequest,
  type PerfHistoryRequest,
} from "@/lib/performance/history";
import type { ConfigEntry } from "@/types/generated/ConfigEntry";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { ImportFormat } from "@/types/generated/ImportFormat";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { VideoSetting } from "@/types/generated/VideoSetting";
import type { State } from "..";

const MAX_HISTORY_SIZE = 30;

/** Where one of the user's own configs came from. */
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

/** An imported, pasted or forked config. Presets live in the catalog instead. */
export type UserPerfConfig = {
  /** `user:<uuid>` */
  id: string;
  name: string;
  createdAt: string;
  origin: UserPerfConfigOrigin;
  entries: ConfigEntry[];
  videoSettings: VideoSetting[];
  baseBuild: number | null;
};

export type PerfHistoryEntry = {
  id: string;
  at: string;
  action: "applied" | "removed";
  configId: string | null;
  name: string | null;
  /** Lets the History tab re-apply what was applied. */
  request: PerfHistoryRequest | null;
  appliedCount: number | null;
};

type NewPerfHistoryEntry = Omit<PerfHistoryEntry, "id" | "at" | "request"> & {
  request: PerfApplyRequest | null;
};

export type PerformanceState = {
  perfUserConfigs: Record<string, UserPerfConfig>;
  /** The user's tweaks per config id, kept when switching configs. */
  perfOverrides: Record<string, EntryOverride[]>;
  perfIncludeEngineSections: Record<string, boolean>;
  perfHistory: PerfHistoryEntry[];
  /** Mods whose bundled config the user chose not to import. */
  perfDismissedModConfigs: Record<string, true>;
  addUserPerfConfig: (config: UserPerfConfig) => void;
  renameUserPerfConfig: (id: string, name: string) => void;
  removeUserPerfConfig: (id: string) => void;
  setPerfOverrides: (configId: string, overrides: EntryOverride[]) => void;
  setPerfIncludeEngineSections: (configId: string, include: boolean) => void;
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
      return { perfUserConfigs, perfOverrides, perfIncludeEngineSections };
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
  recordPerfHistory: ({ request, ...entry }) =>
    set((state) => ({
      perfHistory: [
        {
          ...entry,
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          request: request && compactHistoryRequest(request),
        },
        ...state.perfHistory,
      ].slice(0, MAX_HISTORY_SIZE),
    })),
  dismissModConfig: (modId) =>
    set((state) => ({
      perfDismissedModConfigs: {
        ...state.perfDismissedModConfigs,
        [modId]: true,
      },
    })),
});
