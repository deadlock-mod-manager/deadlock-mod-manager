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

const toTimestamp = (
  value: Date | string | null | undefined,
): number | undefined => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }

  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

const normalizeDateValue = (
  value: Date | string | null | undefined,
): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? undefined : value.toISOString();
  }

  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  return Number.isNaN(timestamp) ? undefined : parsed.toISOString();
};

const applyUpdateMetadata = (mod: LocalMod): LocalMod => {
  const normalizedInstalled = normalizeDateValue(mod.installedRemoteUpdatedAt);
  const remoteTimestamp = toTimestamp(mod.remoteUpdatedAt);
  const installedTimestamp = toTimestamp(normalizedInstalled);
  const isUpdateAvailable =
    remoteTimestamp !== undefined &&
    installedTimestamp !== undefined &&
    remoteTimestamp > installedTimestamp;

  if (
    normalizedInstalled === mod.installedRemoteUpdatedAt &&
    mod.isUpdateAvailable === isUpdateAvailable
  ) {
    return mod;
  }

  return {
    ...mod,
    installedRemoteUpdatedAt: normalizedInstalled,
    isUpdateAvailable,
  };
};

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
  setModDownloads: (remoteId: string, downloads: ModDownloadItem[]) => void;
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
  syncRemoteMods: (remoteMods: ModDto[]) => void;
  upsertRemoteMod: (remoteMod: ModDto) => void;
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
      const installedTimestamp =
        additional?.installedRemoteUpdatedAt ??
        (additional?.status === ModStatus.Installed
          ? mod.remoteUpdatedAt
          : undefined);
      const normalizedInstalled = normalizeDateValue(installedTimestamp);

      const newMod: LocalMod = {
        ...mod,
        status: ModStatus.Downloading,
        installOrder,
        ...additional,
        installedRemoteUpdatedAt: normalizedInstalled,
      };

      return {
        localMods: [...state.localMods, applyUpdateMetadata(newMod)],
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

      const baseMod: LocalMod = {
        ...mod,
        status: markAsInstalled ? ModStatus.Installed : ModStatus.Downloaded,
        downloadedAt: new Date(),
        installedVpks: markAsInstalled ? [filePath] : [],
        installOrder: markAsInstalled ? maxOrder + 1 : undefined,
        installedRemoteUpdatedAt: markAsInstalled
          ? normalizeDateValue(mod.remoteUpdatedAt)
          : undefined,
      };

      const newMod = applyUpdateMetadata(baseMod);

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
      localMods: state.localMods.map((existing) => {
        if (existing.remoteId !== remoteId) {
          return applyUpdateMetadata(existing);
        }

        const downloadedAt =
          status === ModStatus.Downloaded &&
          existing.status !== ModStatus.Installed
            ? new Date()
            : existing.downloadedAt;

        const installedRemoteUpdatedAt =
          status === ModStatus.Installed
            ? normalizeDateValue(existing.remoteUpdatedAt)
            : existing.installedRemoteUpdatedAt;

        const updatedMod: LocalMod = {
          ...existing,
          status,
          downloadedAt,
          installedRemoteUpdatedAt,
        };

        return applyUpdateMetadata(updatedMod);
      }),
    }));
  },

  removeMod: (remoteId) =>
    set((state) => {
      const newProgress = { ...state.modProgress };
      delete newProgress[remoteId];
      return {
        localMods: state.localMods.filter((mod) => mod.remoteId !== remoteId),
        modProgress: newProgress,
      };
    }),

  setMods: (mods) =>
    set({ localMods: mods.map((mod) => applyUpdateMetadata(mod)) }),

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
      localMods: state.localMods.map((existing) => {
        if (existing.remoteId !== remoteId) {
          return applyUpdateMetadata(existing);
        }

        const latestRemoteTimestamp = normalizeDateValue(
          existing.remoteUpdatedAt,
        );

        const updatedMod: LocalMod = {
          ...existing,
          status: ModStatus.Installed,
          installedVpks: vpks,
          installedFileTree: fileTree,
          installedRemoteUpdatedAt:
            latestRemoteTimestamp ?? existing.installedRemoteUpdatedAt,
        };

        return applyUpdateMetadata(updatedMod);
      }),
    })),

  setSelectedDownload: (remoteId: string, download: ModDownloadItem) =>
    set((state) => ({
      localMods: state.localMods.map((existing) => {
        if (existing.remoteId !== remoteId) {
          return applyUpdateMetadata(existing);
        }

        return applyUpdateMetadata({
          ...existing,
          selectedDownload: download,
        });
      }),
    })),

  setModDownloads: (remoteId: string, downloads: ModDownloadItem[]) =>
    set((state) => ({
      localMods: state.localMods.map((existing) => {
        if (existing.remoteId !== remoteId) {
          return applyUpdateMetadata(existing);
        }

        return applyUpdateMetadata({
          ...existing,
          downloads,
        });
      }),
    })),

  setAnalysisResult: (result) => set({ analysisResult: result }),
  setAnalysisDialogOpen: (open) => set({ analysisDialogOpen: open }),
  clearAnalysisDialog: () =>
    set({ analysisResult: null, analysisDialogOpen: false }),

  setModOrder: (remoteId: string, order: number) =>
    set((state) => ({
      localMods: state.localMods.map((mod) => {
        if (mod.remoteId !== remoteId) {
          return mod;
        }

        if (mod.installOrder === order) {
          return mod;
        }

        return applyUpdateMetadata({
          ...mod,
          installOrder: order,
        });
      }),
    })),

  reorderMods: (orderedRemoteIds: string[]) =>
    set((state) => ({
      localMods: state.localMods.map((mod) => {
        const newOrder = orderedRemoteIds.indexOf(mod.remoteId);
        if (newOrder < 0 || newOrder === mod.installOrder) {
          return mod;
        }

        return applyUpdateMetadata({
          ...mod,
          installOrder: newOrder,
        });
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
          if (!newVpks) {
            return mod;
          }

          logger.info("Updating VPKs for mod", {
            remoteId: mod.remoteId,
            oldVpks: mod.installedVpks,
            newVpks,
          });

          return applyUpdateMetadata({
            ...mod,
            installedVpks: newVpks,
          });
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
        if (newOrder === undefined) {
          return mod;
        }

        return applyUpdateMetadata({
          ...mod,
          installOrder: newOrder,
        });
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

  syncRemoteMods: (remoteMods) =>
    set((state) => {
      if (!Array.isArray(remoteMods) || remoteMods.length === 0) {
        return state;
      }

      const remoteById = new Map(remoteMods.map((mod) => [mod.remoteId, mod]));

      const mergedMods = state.localMods.map((localMod) => {
        const remote = remoteById.get(localMod.remoteId);
        if (!remote) {
          return applyUpdateMetadata(localMod);
        }

        const merged = {
          ...localMod,
          ...remote,
        } as LocalMod;

        return applyUpdateMetadata(merged);
      });

      return {
        ...state,
        localMods: mergedMods,
      };
    }),

  upsertRemoteMod: (remoteMod) =>
    set((state) => ({
      localMods: state.localMods.map((localMod) => {
        if (localMod.remoteId !== remoteMod.remoteId) {
          return applyUpdateMetadata(localMod);
        }

        const merged = {
          ...localMod,
          ...remoteMod,
        } as LocalMod;

        return applyUpdateMetadata(merged);
      }),
    })),
});
