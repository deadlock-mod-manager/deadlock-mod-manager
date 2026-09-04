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
import type { ProfileId } from "@/types/profiles";
import type { State } from "..";
import {
  applyToModsAndAllProfiles,
  applyToModsInProfile,
} from "../utils/mod-slice";

export type ModProgress = {
  percentage: number;
  speed?: number;
};

export type HeroDetectionProgress = {
  status: "idle" | "scanning";
  current: number;
  total: number;
  currentModName: string | null;
};

export type IdentityMigration = {
  from: string;
  to: string;
};

export type ModsState = {
  localMods: LocalMod[];
  modProgress: Record<string, ModProgress>;
  defaultSort: SortType;
  /**
   * Mods the user took off a hero's list on the Hero Skins page. They stay in
   * the library and can be put back from there, they are just not listed.
   */
  hiddenHeroMods: Record<string, true>;
  pendingIdentityMigrations: IdentityMigration[];
  // Analysis dialog state
  analysisResult: AnalyzeAddonsResult | null;
  analysisDialogOpen: boolean;
  // Hero detection state (ephemeral)
  heroDetection: HeroDetectionProgress;

  setDefaultSort: (sortType: SortType) => void;
  addLocalMod: (
    mod: ModDto,
    additional?: Partial<LocalMod>,
    profileId?: ProfileId,
  ) => void;
  addIdentifiedLocalMod: (
    mod: ModDto,
    filePath: string,
    markAsInstalled?: boolean,
  ) => void;
  removeMod: (remoteId: string, profileId?: ProfileId) => void;
  setMods: (mods: LocalMod[]) => void;
  setModStatus: (
    remoteId: string,
    status: ModStatus,
    profileId?: ProfileId,
  ) => void;
  setModProgress: (remoteId: string, progress: Progress) => void;
  clearMods: () => void;
  nukeModsState: (keepRemoteIds: string[], profileId?: ProfileId) => void;
  setInstalledVpks: (
    remoteId: string,
    vpks: string[],
    fileTree?: ModFileTree,
    profileId?: ProfileId,
  ) => void;
  setSelectedDownloads: (
    remoteId: string,
    downloads: ModDownloadItem[],
    profileId?: ProfileId,
  ) => void;
  setModDownloads: (
    remoteId: string,
    downloads: ModDownloadItem[],
    profileId?: ProfileId,
  ) => void;
  setActiveVariantArchive: (
    remoteId: string,
    archiveName: string,
    profileId?: ProfileId,
  ) => void;
  getModProgress: (remoteId: string) => ModProgress | undefined;
  setAnalysisResult: (result: AnalyzeAddonsResult | null) => void;
  setAnalysisDialogOpen: (open: boolean) => void;
  clearAnalysisDialog: () => void;
  setModOrder: (remoteId: string, order: number, profileId?: ProfileId) => void;
  reorderMods: (orderedRemoteIds: string[], profileId?: ProfileId) => void;
  updateModVpksAfterReorder: (
    vpkMappings: Array<[string, string[]]>,
    profileId?: ProfileId,
  ) => void;
  getOrderedMods: () => LocalMod[];
  getNextInstallOrder: () => number;
  migrateLegacyMods: () => void;
  setDetectedHero: (
    remoteId: string,
    hero: string | null,
    usesCriticalPaths?: boolean,
  ) => void;
  setHeroOverride: (
    remoteId: string,
    heroOverride: string | null | undefined,
  ) => void;
  clearAllDetectedHeroes: () => void;
  setHeroDetection: (progress: Partial<HeroDetectionProgress>) => void;
  hideHeroMod: (remoteId: string) => void;
  restoreHeroMod: (remoteId: string) => void;
  completeIdentityMigrations: () => void;
};

export const modsDeepMergeKeys =
  [] as const satisfies readonly (keyof ModsState)[];

export const createModsSlice: StateCreator<State, [], [], ModsState> = (
  set,
  get,
) => ({
  localMods: [],
  modProgress: {},
  hiddenHeroMods: {},
  pendingIdentityMigrations: [],
  analysisResult: null,
  analysisDialogOpen: false,
  heroDetection: { status: "idle", current: 0, total: 0, currentModName: null },

  completeIdentityMigrations: () => set({ pendingIdentityMigrations: [] }),

  defaultSort: SortType.LAST_UPDATED,
  setDefaultSort: (sortType: SortType) => set({ defaultSort: sortType }),
  addLocalMod: (mod, additional, requestedProfileId) =>
    set((state) => {
      const profileId = requestedProfileId ?? state.activeProfileId;
      const profile = state.profiles[profileId];
      const profileMods = profile?.mods ?? state.localMods;

      if (profileMods.some((m) => m.id === mod.id)) {
        return state;
      }

      const maxOrder =
        profileMods.length > 0
          ? Math.max(...profileMods.map((m) => m.installOrder ?? -1))
          : -1;
      const installOrder = additional?.installOrder ?? maxOrder + 1;

      const effectiveStatus = additional?.status ?? ModStatus.Downloading;
      const newMod = {
        ...mod,
        status: ModStatus.Downloading,
        installOrder,
        ...additional,
        downloadedAt:
          additional?.downloadedAt ??
          (effectiveStatus !== ModStatus.Downloading ? new Date() : undefined),
        selectedDownloads: additional?.selectedDownloads,
      };

      if (profile) {
        const nextMods = [...profile.mods, newMod];
        return {
          localMods:
            state.activeProfileId === profileId ? nextMods : state.localMods,
          profiles: {
            ...state.profiles,
            [profileId]: { ...profile, mods: nextMods },
          },
        };
      }

      return {
        localMods: [...state.localMods, newMod],
      };
    }),

  addIdentifiedLocalMod: (mod, filePath, markAsInstalled = true) =>
    set((state) => {
      logger
        .withMetadata({
          modId: mod.id,
          remoteId: mod.remoteId,
          name: mod.name,
          filePath,
          markAsInstalled,
          existingModCount: state.localMods.length,
        })
        .info("Adding identified local mod");

      if (state.localMods.some((m) => m.remoteId === mod.remoteId)) {
        logger
          .withMetadata({ remoteId: mod.remoteId })
          .info("Mod already exists in store, skipping");
        return state;
      }

      const maxOrder =
        state.localMods.length > 0
          ? Math.max(...state.localMods.map((m) => m.installOrder ?? -1))
          : -1;

      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      const newMod = {
        ...mod,
        status: markAsInstalled ? ModStatus.Installed : ModStatus.Downloaded,
        downloadedAt: new Date(),
        installedVpks: markAsInstalled ? [fileName] : [],
        installOrder: markAsInstalled ? maxOrder + 1 : undefined,
        installedFileTree:
          markAsInstalled && filePath
            ? {
                files: [
                  {
                    name: fileName,
                    path: fileName,
                    size: 0,
                    is_selected: true,
                    archive_name: "",
                  },
                ],
                total_files: 1,
                has_multiple_files: false,
              }
            : undefined,
      };

      logger
        .withMetadata({
          modId: newMod.id,
          remoteId: newMod.remoteId,
          name: newMod.name,
        })
        .info("Adding new mod to store and enabling in current profile");

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

  setModStatus: (remoteId, status, requestedProfileId) => {
    const state = get();
    const profileId = requestedProfileId ?? state.activeProfileId;
    const mod = state.profiles[profileId]?.mods.find(
      (candidate) => candidate.remoteId === remoteId,
    );
    if (!mod) {
      logger.withMetadata({ remoteId }).error("Mod not found");
      return;
    }
    const validateStatus = ModStatusStateMachine.validateTransition(
      mod.status,
      status,
    );

    if (validateStatus.isErr()) {
      logger
        .withMetadata({ remoteId, status })
        .withError(validateStatus.error)
        .error("Invalid status transition");
      return;
    }

    return set((state) =>
      applyToModsInProfile(state, profileId, (mods) =>
        mods.map((mod) => {
          if (mod.remoteId !== remoteId) return mod;
          return {
            ...mod,
            status,
            downloadedAt:
              (status === ModStatus.Downloaded &&
                mod.status !== ModStatus.Installed) ||
              (status === ModStatus.Installed && !mod.downloadedAt)
                ? new Date()
                : mod.downloadedAt,
          };
        }),
      ),
    );
  },

  removeMod: (remoteId, requestedProfileId) =>
    set((state) => {
      const profileId = requestedProfileId ?? state.activeProfileId;
      const newProgress = { ...state.modProgress };
      delete newProgress[remoteId];
      // Dropped along with the mod, so re-downloading it does not come back
      // already hidden from its hero.
      const { [remoteId]: _hidden, ...hiddenHeroMods } = state.hiddenHeroMods;

      const currentProfile = state.profiles[profileId];

      if (currentProfile) {
        const { [remoteId]: _removed, ...remainingEnabledMods } =
          currentProfile.enabledMods ?? {};

        const updatedProfile = {
          ...currentProfile,
          mods: currentProfile.mods.filter((mod) => mod.remoteId !== remoteId),
          enabledMods: remainingEnabledMods,
        };

        return {
          localMods:
            state.activeProfileId === profileId
              ? state.localMods.filter((mod) => mod.remoteId !== remoteId)
              : state.localMods,
          modProgress: newProgress,
          hiddenHeroMods,
          profiles: {
            ...state.profiles,
            [profileId]: updatedProfile,
          },
        };
      }

      return {
        localMods: state.localMods.filter((mod) => mod.remoteId !== remoteId),
        modProgress: newProgress,
        hiddenHeroMods,
      };
    }),

  setMods: (mods) => set({ localMods: mods }),

  clearMods: () =>
    set((state) => {
      const currentProfile = state.profiles[state.activeProfileId];

      return {
        localMods: [],
        modProgress: {},
        hiddenHeroMods: {},
        profiles: currentProfile
          ? {
              ...state.profiles,
              [state.activeProfileId]: {
                ...currentProfile,
                mods: [],
                enabledMods: {},
              },
            }
          : state.profiles,
      };
    }),

  // clearMods only empties localMods, which leaves the active profile still
  // holding its own copy of every mod - exactly the drift a nuke is supposed to
  // remove. This wipes both, keeping only the mods the caller wants to survive
  // (local mods, which cannot be re-downloaded).
  nukeModsState: (keepRemoteIds, requestedProfileId) =>
    set((state) => {
      const profileId = requestedProfileId ?? state.activeProfileId;
      const keep = new Set(keepRemoteIds);
      const profile = state.profiles[profileId];
      const profileMods = profile?.mods ?? state.localMods;
      const nextProfileMods = profileMods.filter((mod) =>
        keep.has(mod.remoteId),
      );
      const localMods =
        state.activeProfileId === profileId ? nextProfileMods : state.localMods;
      const hiddenHeroMods = Object.fromEntries(
        Object.entries(state.hiddenHeroMods).filter(([remoteId]) =>
          keep.has(remoteId),
        ),
      );

      logger
        .withMetadata({
          profileId,
          removed: profileMods.length - nextProfileMods.length,
          kept: nextProfileMods.length,
        })
        .info("Nuking mods state");

      if (!profile) {
        return { localMods, modProgress: {}, hiddenHeroMods };
      }

      return {
        localMods,
        modProgress: {},
        hiddenHeroMods,
        profiles: {
          ...state.profiles,
          [profileId]: {
            ...profile,
            mods: nextProfileMods,
            enabledMods: Object.fromEntries(
              Object.entries(profile.enabledMods).filter(([remoteId]) =>
                keep.has(remoteId),
              ),
            ),
          },
        },
      };
    }),

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

  setInstalledVpks: (remoteId, vpks, fileTree, requestedProfileId) =>
    set((state) => {
      const profileId = requestedProfileId ?? state.activeProfileId;
      return applyToModsInProfile(state, profileId, (mods) =>
        mods.map((mod) => ({
          ...mod,
          status:
            mod.remoteId === remoteId && vpks.length > 0
              ? ModStatus.Installed
              : mod.status,
          installedVpks: mod.remoteId === remoteId ? vpks : mod.installedVpks,
          installedFileTree:
            mod.remoteId === remoteId ? fileTree : mod.installedFileTree,
        })),
      );
    }),

  setSelectedDownloads: (remoteId, downloads, requestedProfileId) =>
    set((state) => {
      const profileId = requestedProfileId ?? state.activeProfileId;
      return applyToModsInProfile(state, profileId, (mods) =>
        mods.map((mod) => ({
          ...mod,
          selectedDownloads:
            mod.remoteId === remoteId ? downloads : mod.selectedDownloads,
        })),
      );
    }),

  setModDownloads: (remoteId, downloads, requestedProfileId) =>
    set((state) => {
      const profileId = requestedProfileId ?? state.activeProfileId;
      return applyToModsInProfile(state, profileId, (mods) =>
        mods.map((mod) => ({
          ...mod,
          downloads: mod.remoteId === remoteId ? downloads : mod.downloads,
        })),
      );
    }),

  setActiveVariantArchive: (remoteId, archiveName, requestedProfileId) =>
    set((state) => {
      const profileId = requestedProfileId ?? state.activeProfileId;
      return applyToModsInProfile(state, profileId, (mods) =>
        mods.map((mod) => ({
          ...mod,
          activeVariantArchive:
            mod.remoteId === remoteId ? archiveName : mod.activeVariantArchive,
        })),
      );
    }),

  setAnalysisResult: (result) => set({ analysisResult: result }),
  setAnalysisDialogOpen: (open) => set({ analysisDialogOpen: open }),
  clearAnalysisDialog: () =>
    set({ analysisResult: null, analysisDialogOpen: false }),

  setModOrder: (remoteId, order, requestedProfileId) =>
    set((state) => {
      const profileId = requestedProfileId ?? state.activeProfileId;
      return applyToModsInProfile(state, profileId, (mods) =>
        mods.map((mod) => ({
          ...mod,
          installOrder: mod.remoteId === remoteId ? order : mod.installOrder,
        })),
      );
    }),

  reorderMods: (orderedRemoteIds, requestedProfileId) =>
    set((state) => {
      const profileId = requestedProfileId ?? state.activeProfileId;
      return applyToModsInProfile(state, profileId, (mods) =>
        mods.map((mod) => {
          const newOrder = orderedRemoteIds.indexOf(mod.remoteId);
          return {
            ...mod,
            installOrder: newOrder >= 0 ? newOrder : mod.installOrder,
          };
        }),
      );
    }),

  updateModVpksAfterReorder: (vpkMappings, requestedProfileId) =>
    set((state) => {
      const profileId = requestedProfileId ?? state.activeProfileId;
      logger
        .withMetadata({
          mappingsCount: vpkMappings.length,
          mappings: vpkMappings.map(([remoteId, vpks]) => ({
            remoteId,
            vpkCount: vpks.length,
          })),
        })
        .info("Updating mod VPK mappings after reorder");

      const vpkMap = new Map(vpkMappings);
      const updateMods = (mods: typeof state.localMods) =>
        mods.map((mod) => {
          const newVpks = vpkMap.get(mod.remoteId);
          if (newVpks) {
            logger
              .withMetadata({
                remoteId: mod.remoteId,
                oldVpks: mod.installedVpks,
                newVpks,
              })
              .info("Updating VPKs for mod");
            return {
              ...mod,
              installedVpks: newVpks,
            };
          }
          return mod;
        });

      return applyToModsInProfile(state, profileId, updateMods);
    }),

  getOrderedMods: () => {
    const { localMods } = get();

    const installedMods = localMods.filter(
      (mod) =>
        mod.status === ModStatus.Installed &&
        mod.installedVpks &&
        mod.installedVpks.length > 0,
    );

    const modsWithOrder = installedMods.map((mod, index) =>
      Object.assign({}, mod, { installOrder: mod.installOrder ?? index }),
    );

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

      logger
        .withMetadata({
          totalMods: state.localMods.length,
          installedMods: installedMods.length,
          modsToMigrate: installedMods.filter(
            (mod) => mod.installOrder === undefined,
          ).length,
        })
        .info("Migrating legacy installed mods without install order");

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

      logger
        .withMetadata({ migratedInstalledMods: modOrderUpdates.size })
        .info("Legacy mod migration completed");

      return {
        ...state,
        localMods: migratedMods,
      };
    });
  },

  setDetectedHero: (
    remoteId: string,
    hero: string | null,
    usesCriticalPaths?: boolean,
  ) =>
    set((state) => {
      const updateMods = (mods: LocalMod[]) =>
        mods.map((mod) =>
          mod.remoteId === remoteId
            ? {
                ...mod,
                detectedHero: hero,
                usesCriticalPaths: usesCriticalPaths ?? mod.usesCriticalPaths,
              }
            : mod,
        );

      return applyToModsAndAllProfiles(state, updateMods);
    }),

  setHeroOverride: (remoteId, heroOverride) =>
    set((state) => {
      const updateMods = (mods: LocalMod[]) =>
        mods.map((mod) => {
          if (mod.remoteId !== remoteId) return mod;

          if (heroOverride === undefined) {
            const { heroOverride: _heroOverride, ...nextMod } = mod;
            return nextMod;
          }

          return {
            ...mod,
            heroOverride,
          };
        });

      return applyToModsAndAllProfiles(state, updateMods);
    }),

  clearAllDetectedHeroes: () =>
    set((state) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const updateMods = (mods: LocalMod[]) =>
        mods.map((mod) => ({
          ...mod,
          detectedHero: undefined,
        }));

      return applyToModsAndAllProfiles(state, updateMods);
    }),

  setHeroDetection: (progress) =>
    set((state) => ({
      heroDetection: { ...state.heroDetection, ...progress },
    })),

  hideHeroMod: (remoteId) =>
    set((state) => ({
      hiddenHeroMods: { ...state.hiddenHeroMods, [remoteId]: true },
    })),

  restoreHeroMod: (remoteId) =>
    set((state) => {
      const { [remoteId]: _hidden, ...hiddenHeroMods } = state.hiddenHeroMods;
      return { hiddenHeroMods };
    }),
});
