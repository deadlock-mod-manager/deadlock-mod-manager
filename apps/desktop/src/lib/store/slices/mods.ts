import type { ModDto } from "@deadlock-mods/shared";
import type { StateCreator } from "zustand";
import { SortType } from "@/lib/constants";
import logger from "@/lib/logger";
import { ModStatusStateMachine } from "@/lib/state-machines/mod-status";
import {
  type AnalyzeAddonsResult,
  type LocalMod,
  type ModFileTree,
  ModStatus,
  type Progress,
} from "@/types/mods";
import type { State } from "..";

export type ModProgress = {
  percentage: number;
  speed?: number;
};

export type ModsState = {
  localMods: LocalMod[];
  modProgress: Record<string, ModProgress>;
  defaultSort: SortType;
  // Analysis dialog state
  analysisResult: AnalyzeAddonsResult | null;
  analysisDialogOpen: boolean;

  setDefaultSort: (sortType: SortType) => void;
  addLocalMod: (mod: ModDto, additional?: Partial<LocalMod>) => void;
  addIdentifiedLocalMod: (mod: ModDto, filePath: string) => void;
  removeMod: (remoteId: string) => void;
  setMods: (mods: LocalMod[]) => void;
  setModStatus: (remoteId: string, status: ModStatus) => void;
  setModPath: (remoteId: string, path: string) => void;
  setModProgress: (remoteId: string, progress: Progress) => void;
  clearMods: () => void;
  setInstalledVpks: (
    remoteId: string,
    vpks: string[],
    fileTree?: ModFileTree,
  ) => void;
  getModProgress: (remoteId: string) => ModProgress | undefined;
  // Analysis dialog actions
  setAnalysisResult: (result: AnalyzeAddonsResult | null) => void;
  setAnalysisDialogOpen: (open: boolean) => void;
  clearAnalysisDialog: () => void;
};

export const createModsSlice: StateCreator<State, [], [], ModsState> = (
  set,
  get,
) => ({
  localMods: [],
  modProgress: {},
  // Analysis dialog initial state
  analysisResult: null,
  analysisDialogOpen: false,

  defaultSort: SortType.LAST_UPDATED,
  setDefaultSort: (sortType: SortType) => set({ defaultSort: sortType }),
  addLocalMod: (mod, additional) =>
    set((state) => {
      if (state.localMods.some((m) => m.id === mod.id)) {
        return state;
      }
      return {
        localMods: [
          ...state.localMods,
          { ...mod, status: ModStatus.Downloading, ...additional },
        ],
      };
    }),

  addIdentifiedLocalMod: (mod, filePath) =>
    set((state) => {
      console.log("Adding identified local mod:", {
        modId: mod.id,
        remoteId: mod.remoteId,
        name: mod.name,
        filePath,
        existingModCount: state.localMods.length,
      });

      // Check if mod already exists (by remoteId)
      if (state.localMods.some((m) => m.remoteId === mod.remoteId)) {
        console.log("Mod already exists in store, skipping:", mod.remoteId);
        return state;
      }

      const newMod = {
        ...mod,
        status: ModStatus.Installed, // Already installed locally
        path: filePath,
        downloadedAt: new Date(),
        installedVpks: [filePath], // The VPK file path
      };

      console.log("Adding new mod to store:", newMod);

      return {
        localMods: [...state.localMods, newMod],
      };
    }),

  setModStatus: (remoteId, status) => {
    const mod = get().localMods.find((m) => m.remoteId === remoteId);
    if (!mod) {
      logger.error("Mod not found", { remoteId });
      return;
    }
    const validateStatus = ModStatusStateMachine.validateTransition(
      mod.status,
      status,
    );

    if (validateStatus.isErr()) {
      logger.error("Invalid status transition", {
        remoteId,
        status,
        error: validateStatus.error,
      });
      return;
    }

    return set((state) => ({
      localMods: state.localMods.map((mod) => ({
        ...mod,
        status: mod.remoteId === remoteId ? status : mod.status,
        downloadedAt:
          status === ModStatus.Downloaded && mod.status !== ModStatus.Installed
            ? new Date()
            : undefined,
      })),
    }));
  },

  setModPath: (remoteId, path) =>
    set((state) => ({
      localMods: state.localMods.map((mod) => ({
        ...mod,
        path: mod.remoteId === remoteId ? path : mod.path,
      })),
    })),

  removeMod: (remoteId) =>
    set((state) => {
      const newProgress = { ...state.modProgress };
      delete newProgress[remoteId];
      return {
        localMods: state.localMods.filter((mod) => mod.remoteId !== remoteId),
        modProgress: newProgress,
      };
    }),

  setMods: (mods) => set({ localMods: mods }),

  clearMods: () => set({ localMods: [], modProgress: {} }),

  setModProgress: (remoteId, progress, index = 0) =>
    set((state) => ({
      modProgress: {
        ...state.modProgress,
        [`${remoteId}-${index}`]: {
          percentage:
            ((progress?.progressTotal ?? 0) / (progress?.total ?? 1)) * 100,
          speed: progress?.transferSpeed,
        },
      },
    })),

  getModProgress: (remoteId, index = 0) =>
    get().modProgress[`${remoteId}-${index}`],

  setInstalledVpks: (
    remoteId: string,
    vpks: string[],
    fileTree?: ModFileTree,
  ) =>
    set((state) => ({
      localMods: state.localMods.map((mod) => ({
        ...mod,
        status: mod.remoteId === remoteId ? ModStatus.Installed : mod.status,
        installedVpks: mod.remoteId === remoteId ? vpks : mod.installedVpks,
        installedFileTree:
          mod.remoteId === remoteId ? fileTree : mod.installedFileTree,
      })),
    })),

  // Analysis dialog actions
  setAnalysisResult: (result) => set({ analysisResult: result }),
  setAnalysisDialogOpen: (open) => set({ analysisDialogOpen: open }),
  clearAnalysisDialog: () =>
    set({ analysisResult: null, analysisDialogOpen: false }),
});
