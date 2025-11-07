import type { ModDto } from "@deadlock-mods/shared";
import type { StateCreator } from "zustand";
import { SortType } from "@/lib/constants";
import logger from "@/lib/logger";
import { ModStatusStateMachine } from "@/lib/state-machines/mod-status";
import {
  type AnalyzeAddonsResult,
  type LocalMod,
  type ModDownloadItem,
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
  addIdentifiedLocalMod: (
    mod: ModDto,
    filePath: string,
    markAsInstalled?: boolean,
  ) => void;
  removeMod: (remoteId: string) => void;
  setMods: (mods: LocalMod[]) => void;
  setModStatus: (remoteId: string, status: ModStatus) => void;
  setModProgress: (remoteId: string, progress: Progress) => void;
  clearMods: () => void;
  setInstalledVpks: (
    remoteId: string,
    vpks: string[],
    fileTree?: ModFileTree,
  ) => void;
  setSelectedDownload: (remoteId: string, download: ModDownloadItem) => void;
  getModProgress: (remoteId: string) => ModProgress | undefined;
  setAnalysisResult: (result: AnalyzeAddonsResult | null) => void;
  setAnalysisDialogOpen: (open: boolean) => void;
  clearAnalysisDialog: () => void;
  setModOrder: (remoteId: string, order: number) => void;
  reorderMods: (orderedRemoteIds: string[]) => void;
  updateModVpksAfterReorder: (vpkMappings: Array<[string, string[]]>) => void;
  getOrderedMods: () => LocalMod[];
  getNextInstallOrder: () => number;
  migrateLegacyMods: () => void;
};

export const createModsSlice: StateCreator<State, [], [], ModsState> = (
  set,
  get,
) => ({
  localMods: [],
  modProgress: {},
  analysisResult: null,
  analysisDialogOpen: false,

  defaultSort: SortType.LAST_UPDATED,
  setDefaultSort: (sortType: SortType) => set({ defaultSort: sortType }),
  addLocalMod: (mod, additional) =>
    set((state) => {
      if (state.localMods.some((m) => m.id === mod.id)) {
        return state;
      }

      const maxOrder =
        state.localMods.length > 0
          ? Math.max(...state.localMods.map((m) => m.installOrder ?? -1))
          : -1;
      const installOrder = additional?.installOrder ?? maxOrder + 1;

      const newMod = {
        ...mod,
        status: ModStatus.Downloading,
        installOrder,
        ...additional,
      };

      const { activeProfileId, profiles } = state;
      const currentProfile = profiles[activeProfileId];

      if (currentProfile) {
        const updatedProfile = {
          ...currentProfile,
          mods: [...currentProfile.mods, newMod],
        };

        return {
          localMods: [...state.localMods, newMod],
          profiles: {
            ...state.profiles,
            [activeProfileId]: updatedProfile,
          },
        };
      }

      return {
        localMods: [...state.localMods, newMod],
      };
    }),

  addIdentifiedLocalMod: (mod, filePath, markAsInstalled = true) =>
    set((state) => {
      logger.info("Adding identified local mod", {
        modId: mod.id,
        remoteId: mod.remoteId,
        name: mod.name,
        filePath,
        markAsInstalled,
        existingModCount: state.localMods.length,
      });

      if (state.localMods.some((m) => m.remoteId === mod.remoteId)) {
        logger.info("Mod already exists in store, skipping", {
          remoteId: mod.remoteId,
        });
        return state;
      }

      const maxOrder =
        state.localMods.length > 0
          ? Math.max(...state.localMods.map((m) => m.installOrder ?? -1))
          : -1;

      const newMod = {
        ...mod,
        status: markAsInstalled ? ModStatus.Installed : ModStatus.Downloaded,
        downloadedAt: new Date(),
        installedVpks: markAsInstalled ? [filePath] : [],
        installOrder: markAsInstalled ? maxOrder + 1 : undefined,
      };

      logger.info("Adding new mod to store and enabling in current profile", {
        modId: newMod.id,
        remoteId: newMod.remoteId,
        name: newMod.name,
      });

      const { activeProfileId, profiles } = state;
      const currentProfile = profiles[activeProfileId];

      if (currentProfile) {
        const profileEntry = {
          remoteId: mod.remoteId,
          enabled: true,
          lastModified: new Date(),
        };

        const updatedProfile = {
          ...currentProfile,
          enabledMods: {
            ...currentProfile.enabledMods,
            [mod.remoteId]: profileEntry,
          },
          mods: [...currentProfile.mods, newMod],
        };

        return {
          localMods: [...state.localMods, newMod],
          profiles: {
            ...state.profiles,
            [activeProfileId]: updatedProfile,
          },
        };
      }

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

  removeMod: (remoteId) =>
    set((state) => {
      const newProgress = { ...state.modProgress };
      delete newProgress[remoteId];

      const { activeProfileId, profiles } = state;
      const currentProfile = profiles[activeProfileId];

      if (currentProfile) {
        const updatedProfile = {
          ...currentProfile,
          mods: currentProfile.mods.filter((mod) => mod.remoteId !== remoteId),
        };

        return {
          localMods: state.localMods.filter((mod) => mod.remoteId !== remoteId),
          modProgress: newProgress,
          profiles: {
            ...state.profiles,
            [activeProfileId]: updatedProfile,
          },
        };
      }

      return {
        localMods: state.localMods.filter((mod) => mod.remoteId !== remoteId),
        modProgress: newProgress,
      };
    }),

  setMods: (mods) => set({ localMods: mods }),

  clearMods: () => set({ localMods: [], modProgress: {} }),

  setModProgress: (remoteId, progress) =>
    set((state) => ({
      modProgress: {
        ...state.modProgress,
        [remoteId]: {
          percentage:
            ((progress?.progressTotal ?? 0) / (progress?.total ?? 1)) * 100,
          speed: progress?.transferSpeed,
        },
      },
    })),

  getModProgress: (remoteId) => get().modProgress[remoteId],

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

  setSelectedDownload: (remoteId: string, download: ModDownloadItem) =>
    set((state) => ({
      localMods: state.localMods.map((mod) => ({
        ...mod,
        selectedDownload:
          mod.remoteId === remoteId ? download : mod.selectedDownload,
      })),
    })),

  setAnalysisResult: (result) => set({ analysisResult: result }),
  setAnalysisDialogOpen: (open) => set({ analysisDialogOpen: open }),
  clearAnalysisDialog: () =>
    set({ analysisResult: null, analysisDialogOpen: false }),

  setModOrder: (remoteId: string, order: number) =>
    set((state) => ({
      localMods: state.localMods.map((mod) => ({
        ...mod,
        installOrder: mod.remoteId === remoteId ? order : mod.installOrder,
      })),
    })),

  reorderMods: (orderedRemoteIds: string[]) =>
    set((state) => ({
      localMods: state.localMods.map((mod) => {
        const newOrder = orderedRemoteIds.indexOf(mod.remoteId);
        return {
          ...mod,
          installOrder: newOrder >= 0 ? newOrder : mod.installOrder,
        };
      }),
    })),

  updateModVpksAfterReorder: (vpkMappings: Array<[string, string[]]>) =>
    set((state) => {
      logger.info("Updating mod VPK mappings after reorder", {
        mappingsCount: vpkMappings.length,
        mappings: vpkMappings.map(([remoteId, vpks]) => ({
          remoteId,
          vpkCount: vpks.length,
        })),
      });

      const vpkMap = new Map(vpkMappings);
      return {
        localMods: state.localMods.map((mod) => {
          const newVpks = vpkMap.get(mod.remoteId);
          if (newVpks) {
            logger.info("Updating VPKs for mod", {
              remoteId: mod.remoteId,
              oldVpks: mod.installedVpks,
              newVpks,
            });
            return {
              ...mod,
              installedVpks: newVpks,
            };
          }
          return mod;
        }),
      };
    }),

  getOrderedMods: () => {
    const { localMods } = get();

    const installedMods = localMods.filter(
      (mod) =>
        mod.status === ModStatus.Installed &&
        mod.installedVpks &&
        mod.installedVpks.length > 0,
    );

    const modsWithOrder = installedMods.map((mod, index) => ({
      ...mod,
      installOrder: mod.installOrder ?? index,
    }));

    return modsWithOrder.sort((a, b) => {
      if (a.installOrder !== b.installOrder) {
        return (a.installOrder ?? 999) - (b.installOrder ?? 999);
      }
      const dateA = a.downloadedAt ? new Date(a.downloadedAt).getTime() : 0;
      const dateB = b.downloadedAt ? new Date(b.downloadedAt).getTime() : 0;
      return dateA - dateB;
    });
  },

  getNextInstallOrder: () => {
    const { localMods } = get();
    if (localMods.length === 0) return 0;

    const maxOrder = Math.max(
      ...localMods.map((mod) => mod.installOrder ?? -1),
    );
    return maxOrder + 1;
  },

  migrateLegacyMods: () => {
    set((state) => {
      const installedMods = state.localMods.filter(
        (mod) =>
          mod.status === ModStatus.Installed &&
          mod.installedVpks &&
          mod.installedVpks.length > 0,
      );

      const needsMigration = installedMods.some(
        (mod) => mod.installOrder === undefined,
      );

      if (!needsMigration) {
        return state;
      }

      logger.info("Migrating legacy installed mods without install order", {
        totalMods: state.localMods.length,
        installedMods: installedMods.length,
        modsToMigrate: installedMods.filter(
          (mod) => mod.installOrder === undefined,
        ).length,
      });

      const sortedInstalledMods = [...installedMods].sort((a, b) => {
        const dateA = a.downloadedAt ? new Date(a.downloadedAt).getTime() : 0;
        const dateB = b.downloadedAt ? new Date(b.downloadedAt).getTime() : 0;
        return dateA - dateB;
      });

      const modOrderUpdates = new Map<string, number>();
      sortedInstalledMods.forEach((mod, index) => {
        if (mod.installOrder === undefined) {
          modOrderUpdates.set(mod.remoteId, index);
        }
      });

      const migratedMods = state.localMods.map((mod) => {
        const newOrder = modOrderUpdates.get(mod.remoteId);
        return {
          ...mod,
          installOrder: newOrder !== undefined ? newOrder : mod.installOrder,
        };
      });

      logger.info("Legacy mod migration completed", {
        migratedInstalledMods: modOrderUpdates.size,
      });

      return {
        ...state,
        localMods: migratedMods,
      };
    });
  },
});
