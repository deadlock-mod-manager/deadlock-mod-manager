import { type ModDto } from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import i18n from "i18next";
import type { StateCreator } from "zustand";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { sortModsByInstallOrder } from "@/lib/profiles/import-profile-shared";
import { applyUpdatedVpkMappings } from "@/lib/profiles/profile-reorder";
import { type LocalMod, ModStatus, type InstalledModInfo } from "@/types/mods";
import {
  createProfileId,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  type ModProfile,
  type ModProfileEntry,
  type ProfileId,
  type ProfileSwitchResult,
} from "@/types/profiles";

export interface ProfilesState {
  profiles: Record<ProfileId, ModProfile>;
  activeProfileId: ProfileId;
  isSwitching: boolean;

  createProfile: (
    name: string,
    description?: string,
  ) => Promise<ProfileId | null>;
  deleteProfile: (profileId: ProfileId) => Promise<boolean>;
  updateProfile: (
    profileId: ProfileId,
    updates: Partial<Pick<ModProfile, "name" | "description">>,
  ) => boolean;
  setProfileFolderName: (profileId: ProfileId, folderName: string) => void;
  upsertProfile: (profile: ModProfile) => void;
  createImportProfileFolder: (
    profileId: ProfileId,
    profileName: string,
  ) => Promise<string>;
  applyImportInstalledModsToProfile: (
    profileId: ProfileId,
    installedMods: InstalledModInfo[],
    modsDataByRemoteId: Map<string, ModDto>,
    installOrderByRemoteId: Map<string, number>,
  ) => void;
  applyImportReorderVpksToProfile: (
    profileId: ProfileId,
    updatedVpkMappings: Array<[string, string[]]>,
  ) => void;

  switchToProfile: (profileId: ProfileId) => Promise<ProfileSwitchResult>;
  setModEnabledInProfile: (
    profileId: ProfileId,
    remoteId: string,
    enabled: boolean,
  ) => void;
  setModEnabledInCurrentProfile: (remoteId: string, enabled: boolean) => void;
  isModEnabledInProfile: (profileId: ProfileId, remoteId: string) => boolean;
  isModEnabledInCurrentProfile: (remoteId: string) => boolean;

  getActiveProfile: () => ModProfile | undefined;
  getProfile: (profileId: ProfileId) => ModProfile | undefined;
  getAllProfiles: () => ModProfile[];
  getProfilesCount: () => number;
  getEnabledModsCount: (profileId?: ProfileId) => number;
  syncProfilesWithFilesystem: () => Promise<void>;
  syncProfileEnabledMods: (profileId: ProfileId) => Promise<void>;
  saveCurrentModsToProfile: () => void;
  loadModsFromProfile: (profileId: ProfileId) => void;
}

const createDefaultProfile = (): ModProfile => ({
  id: DEFAULT_PROFILE_ID,
  name: DEFAULT_PROFILE_NAME,
  description: "The default mod profile",
  createdAt: new Date(),
  lastUsed: new Date(),
  enabledMods: {},
  isDefault: true,
  folderName: null,
  mods: [],
});

export const profilesDeepMergeKeys =
  [] as const satisfies readonly (keyof ProfilesState)[];

const RECOVERED_PROFILE_DESCRIPTION = "Profile detected from filesystem";
const PROFILE_FOLDER_NAME_PATTERN = /^(profile_\d+_[^_]+)(?:_(.+))?$/;

const toRecoveredProfileName = (value: string) => {
  const displayName = value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    displayName ||
    i18n.t("profiles.unknownProfile", { defaultValue: "Unknown Profile" })
  );
};

const getRecoveredProfileDetails = (folderName: string) => {
  const match = folderName.match(PROFILE_FOLDER_NAME_PATTERN);

  return {
    profileId: createProfileId(match?.[1] ?? folderName),
    displayName: toRecoveredProfileName(match?.[2] ?? folderName),
  };
};

const shouldReplaceRecoveredProfileName = (profile: ModProfile) =>
  profile.description === RECOVERED_PROFILE_DESCRIPTION || !profile.name.trim();

const pickRecoveredProfileSource = (
  existingProfile: ModProfile | undefined,
  recoveredProfile: ModProfile,
) => {
  if (!existingProfile) {
    return recoveredProfile;
  }

  if (existingProfile.mods.length !== recoveredProfile.mods.length) {
    return existingProfile.mods.length > recoveredProfile.mods.length
      ? existingProfile
      : recoveredProfile;
  }

  return Object.keys(existingProfile.enabledMods).length >=
    Object.keys(recoveredProfile.enabledMods).length
    ? existingProfile
    : recoveredProfile;
};

const normalizeRecoveredProfileIds = (
  profiles: Record<ProfileId, ModProfile>,
  activeProfileId: ProfileId,
) => {
  const nextProfiles = { ...profiles };
  let nextActiveProfileId = activeProfileId;
  let changed = false;

  for (const profile of Object.values(profiles)) {
    if (profile.isDefault || !profile.folderName) {
      continue;
    }

    const { profileId, displayName } = getRecoveredProfileDetails(
      profile.folderName,
    );

    if (profile.id === profileId) {
      continue;
    }

    const sourceProfile = pickRecoveredProfileSource(
      nextProfiles[profileId],
      profile,
    );

    delete nextProfiles[profile.id];
    nextProfiles[profileId] = {
      ...sourceProfile,
      id: profileId,
      folderName: profile.folderName,
      name: shouldReplaceRecoveredProfileName(sourceProfile)
        ? displayName
        : sourceProfile.name,
    };

    if (nextActiveProfileId === profile.id) {
      nextActiveProfileId = profileId;
    }

    changed = true;
  }

  return {
    profiles: changed ? nextProfiles : profiles,
    activeProfileId: nextActiveProfileId,
    changed,
  };
};

type ProfilesSliceStore = ProfilesState & {
  localMods: LocalMod[];
};

export const createProfilesSlice: StateCreator<
  ProfilesSliceStore,
  [],
  [],
  ProfilesState
> = (set, get, _store): ProfilesState => ({
  profiles: {
    [DEFAULT_PROFILE_ID]: createDefaultProfile(),
  },
  activeProfileId: DEFAULT_PROFILE_ID,
  isSwitching: false,

  createProfile: async (name: string, description?: string) => {
    const profileId = createProfileId(
      `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    );

    let folderName: string | null = null;

    try {
      folderName = await invoke<string>("create_profile_folder", {
        profileId,
        profileName: name.trim(),
      });
      logger
        .withMetadata({ profileId, folderName })
        .info("Created profile folder");
      const newProfile: ModProfile = {
        id: profileId,
        name: name.trim(),
        description: description?.trim(),
        createdAt: new Date(),
        enabledMods: {},
        isDefault: false,
        folderName: folderName,
        mods: [],
      };

      set((state) => ({
        profiles: {
          ...state.profiles,
          [profileId]: newProfile,
        },
      }));

      return profileId;
    } catch (error) {
      logger
        .withMetadata({ profileId })
        .withError(error)
        .error("Failed to create profile folder");
      return null;
    }
  },

  deleteProfile: async (profileId: ProfileId) => {
    const { profiles, activeProfileId } = get();
    const profile = profiles[profileId];

    if (!profile || profile.isDefault) {
      return false;
    }

    const isDeletingActiveProfile = activeProfileId === profileId;
    const fallbackProfile =
      profiles[DEFAULT_PROFILE_ID] ?? createDefaultProfile();
    let switchedToFallback = false;

    try {
      if (isDeletingActiveProfile) {
        set({ isSwitching: true });

        await invoke("switch_profile", {
          profileFolder: fallbackProfile.folderName,
        });
        switchedToFallback = true;
        logger
          .withMetadata({
            deletedProfileId: profileId,
            fallbackProfileId: DEFAULT_PROFILE_ID,
            fallbackFolderName: fallbackProfile.folderName,
          })
          .info("Switched to fallback profile before deletion");
      }

      if (profile.folderName) {
        await invoke("delete_profile_folder", {
          profileFolder: profile.folderName,
        });
        logger
          .withMetadata({
            profileId,
            folderName: profile.folderName,
          })
          .info("Deleted profile folder");
      }

      const deletedAt = new Date();

      set((state) => {
        const remainingProfiles = { ...state.profiles };

        if (!remainingProfiles[DEFAULT_PROFILE_ID]) {
          remainingProfiles[DEFAULT_PROFILE_ID] = fallbackProfile;
        }

        delete remainingProfiles[profileId];

        if (!isDeletingActiveProfile) {
          return {
            profiles: remainingProfiles,
          };
        }

        const nextActiveProfile = remainingProfiles[DEFAULT_PROFILE_ID];

        return {
          profiles: {
            ...remainingProfiles,
            [DEFAULT_PROFILE_ID]: {
              ...nextActiveProfile,
              lastUsed: deletedAt,
            },
          },
          activeProfileId: DEFAULT_PROFILE_ID,
          localMods: [...nextActiveProfile.mods],
        };
      });

      return true;
    } catch (error) {
      if (switchedToFallback) {
        set({
          activeProfileId: DEFAULT_PROFILE_ID,
          localMods: [...fallbackProfile.mods],
        });
      }
      logger
        .withMetadata({
          profileId,
          folderName: profile.folderName,
          isDeletingActiveProfile,
          switchedToFallback,
        })
        .withError(error)
        .error("Failed to delete profile");
      return false;
    } finally {
      if (isDeletingActiveProfile) {
        set({ isSwitching: false });
      }
    }
  },

  updateProfile: (
    profileId: ProfileId,
    updates: Partial<Pick<ModProfile, "name" | "description">>,
  ) => {
    const { profiles } = get();
    const profile = profiles[profileId];

    if (!profile) {
      return false;
    }

    const updatedProfile: ModProfile = {
      ...profile,
      ...updates,
      name: updates.name?.trim() || profile.name,
      description: updates.description?.trim(),
    };

    set((state) => ({
      profiles: {
        ...state.profiles,
        [profileId]: updatedProfile,
      },
    }));

    return true;
  },

  setProfileFolderName: (profileId: ProfileId, folderName: string) => {
    set((state) => {
      const profile = state.profiles[profileId];

      if (!profile) {
        return state;
      }

      return {
        profiles: {
          ...state.profiles,
          [profileId]: {
            ...profile,
            folderName,
          },
        },
      };
    });
  },

  upsertProfile: (profile: ModProfile) => {
    set((state) => ({
      profiles: {
        ...state.profiles,
        [profile.id]: profile,
      },
    }));
  },

  createImportProfileFolder: async (
    profileId: ProfileId,
    profileName: string,
  ): Promise<string> => {
    const folderName = await invoke<string>("create_profile_folder", {
      profileId,
      profileName,
    });

    get().setProfileFolderName(profileId, folderName);
    return folderName;
  },

  applyImportInstalledModsToProfile: (
    profileId: ProfileId,
    installedMods: InstalledModInfo[],
    modsDataByRemoteId: Map<string, ModDto>,
    installOrderByRemoteId: Map<string, number>,
  ) => {
    set((state) => {
      const profile = state.profiles[profileId];

      if (!profile) {
        return state;
      }

      const now = new Date();
      const updateActiveLocalMods = state.activeProfileId === profileId;
      const nextProfileMods = [...profile.mods];
      const profileIndexesByRemoteId = new Map(
        nextProfileMods.map((mod, index) => [mod.remoteId, index]),
      );
      const nextEnabledMods = { ...profile.enabledMods };
      const nextLocalMods = updateActiveLocalMods
        ? [...state.localMods]
        : state.localMods;
      const localIndexesByRemoteId = updateActiveLocalMods
        ? new Map(nextLocalMods.map((mod, index) => [mod.remoteId, index]))
        : null;

      for (const installedMod of installedMods) {
        const modData = modsDataByRemoteId.get(installedMod.modId);

        if (!modData) {
          continue;
        }

        const installOrder = installOrderByRemoteId.get(installedMod.modId);
        const existingProfileIndex = profileIndexesByRemoteId.get(
          installedMod.modId,
        );
        const existingProfileMod =
          existingProfileIndex === undefined
            ? undefined
            : nextProfileMods[existingProfileIndex];
        const existingLocalIndex = localIndexesByRemoteId?.get(
          installedMod.modId,
        );
        const existingLocalMod =
          existingLocalIndex === undefined
            ? undefined
            : nextLocalMods[existingLocalIndex];
        const baseMod = existingProfileMod ?? existingLocalMod;

        const nextMod: LocalMod = {
          ...(baseMod ?? modData),
          downloadedAt: baseMod?.downloadedAt ?? now,
          status: ModStatus.Installed,
          installedVpks: installedMod.installedVpks,
          installedFileTree: installedMod.fileTree,
          installOrder: installOrder ?? baseMod?.installOrder,
        };

        if (existingProfileIndex === undefined) {
          profileIndexesByRemoteId.set(
            installedMod.modId,
            nextProfileMods.length,
          );
          nextProfileMods.push(nextMod);
        } else {
          nextProfileMods[existingProfileIndex] = nextMod;
        }

        nextEnabledMods[installedMod.modId] = {
          remoteId: installedMod.modId,
          enabled: true,
          lastModified: now,
        };

        if (updateActiveLocalMods && localIndexesByRemoteId) {
          if (existingLocalIndex === undefined) {
            localIndexesByRemoteId.set(
              installedMod.modId,
              nextLocalMods.length,
            );
            nextLocalMods.push(nextMod);
          } else {
            nextLocalMods[existingLocalIndex] = nextMod;
          }
        }
      }

      const nextPartial: Partial<ProfilesSliceStore> = {
        profiles: {
          ...state.profiles,
          [profileId]: {
            ...profile,
            enabledMods: nextEnabledMods,
            mods: sortModsByInstallOrder(nextProfileMods),
          },
        },
      };

      if (updateActiveLocalMods) {
        nextPartial.localMods = sortModsByInstallOrder(nextLocalMods);
      }

      return nextPartial;
    });
  },

  applyImportReorderVpksToProfile: (
    profileId: ProfileId,
    updatedVpkMappings: Array<[string, string[]]>,
  ) => {
    if (updatedVpkMappings.length === 0) {
      return;
    }

    set((state) => {
      const profile = state.profiles[profileId];

      if (!profile) {
        return state;
      }

      const nextPartial: Partial<ProfilesSliceStore> = {
        profiles: {
          ...state.profiles,
          [profileId]: {
            ...profile,
            mods: applyUpdatedVpkMappings(profile.mods, updatedVpkMappings),
          },
        },
      };

      if (state.activeProfileId === profileId) {
        nextPartial.localMods = applyUpdatedVpkMappings(
          state.localMods,
          updatedVpkMappings,
        );
      }

      return nextPartial;
    });
  },

  switchToProfile: async (profileId: ProfileId) => {
    logger.withMetadata({ profileId }).info("Switching to profile");
    const state = get();
    const { profiles, activeProfileId } = state;
    const targetProfile = profiles[profileId];

    if (!targetProfile || profileId === activeProfileId) {
      logger
        .withMetadata({ profileId })
        .error("Profile not found or already active");
      return {
        disabledMods: [],
        enabledMods: [],
        errors: targetProfile ? [] : [`Profile ${profileId} not found`],
      };
    }

    set({ isSwitching: true });

    const result: ProfileSwitchResult = {
      disabledMods: [],
      enabledMods: [],
      errors: [],
    };

    try {
      get().saveCurrentModsToProfile();

      await invoke("switch_profile", {
        profileFolder: targetProfile.folderName,
      });
      logger
        .withMetadata({
          profileId,
          folderName: targetProfile.folderName,
        })
        .info("Successfully switched profile gameinfo.gi path");

      const now = new Date();
      set((state) => ({
        activeProfileId: profileId,
        profiles: {
          ...state.profiles,
          [profileId]: {
            ...targetProfile,
            lastUsed: now,
          },
        },
      }));

      get().loadModsFromProfile(profileId);

      await get().syncProfileEnabledMods(profileId);
    } catch (error) {
      logger
        .withMetadata({ profileId })
        .withError(error)
        .error("Failed to switch profile");
      result.errors.push(`Failed to switch profile: ${getErrorMessage(error)}`);
    } finally {
      set({ isSwitching: false });
    }

    return result;
  },

  setModEnabledInProfile: (
    profileId: ProfileId,
    remoteId: string,
    enabled: boolean,
  ) => {
    const { profiles } = get();
    const profile = profiles[profileId];

    if (!profile) {
      return;
    }

    const profileEntry: ModProfileEntry = {
      remoteId,
      enabled,
      lastModified: new Date(),
    };

    set((state) => ({
      profiles: {
        ...state.profiles,
        [profileId]: {
          ...profile,
          enabledMods: {
            ...profile.enabledMods,
            [remoteId]: profileEntry,
          },
        },
      },
    }));
  },

  setModEnabledInCurrentProfile: (remoteId: string, enabled: boolean) => {
    const { activeProfileId, setModEnabledInProfile } = get();
    setModEnabledInProfile(activeProfileId, remoteId, enabled);
  },

  isModEnabledInProfile: (profileId: ProfileId, remoteId: string) => {
    const { profiles } = get();
    const profile = profiles[profileId];
    return profile?.enabledMods[remoteId]?.enabled ?? false;
  },

  isModEnabledInCurrentProfile: (remoteId: string) => {
    const { activeProfileId, isModEnabledInProfile } = get();
    return isModEnabledInProfile(activeProfileId, remoteId);
  },

  getActiveProfile: () => {
    const { profiles, activeProfileId } = get();
    return profiles[activeProfileId];
  },

  getProfile: (profileId: ProfileId) => {
    const { profiles } = get();
    return profiles[profileId];
  },

  getAllProfiles: () => {
    const { profiles } = get();
    return Object.values(profiles).sort((a, b) => {
      // Default profile first, then by last used, then by creation date
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;

      // Handle lastUsed being a Date or string (from deserialization)
      const aLastUsed = a.lastUsed
        ? typeof a.lastUsed === "string"
          ? new Date(a.lastUsed).getTime()
          : a.lastUsed.getTime()
        : 0;
      const bLastUsed = b.lastUsed
        ? typeof b.lastUsed === "string"
          ? new Date(b.lastUsed).getTime()
          : b.lastUsed.getTime()
        : 0;

      if (aLastUsed !== bLastUsed) {
        return bLastUsed - aLastUsed; // Most recently used first
      }

      // Handle createdAt being a Date or string (from deserialization)
      const aCreated =
        typeof a.createdAt === "string"
          ? new Date(a.createdAt).getTime()
          : a.createdAt.getTime();
      const bCreated =
        typeof b.createdAt === "string"
          ? new Date(b.createdAt).getTime()
          : b.createdAt.getTime();

      return bCreated - aCreated; // Most recently created first
    });
  },

  getProfilesCount: () => {
    const { profiles } = get();
    return Object.keys(profiles).length;
  },

  getEnabledModsCount: (profileId?: ProfileId) => {
    const { profiles, activeProfileId } = get();
    const targetProfileId = profileId ?? activeProfileId;
    const profile = profiles[targetProfileId];

    if (!profile) {
      return 0;
    }

    return Object.values(profile.enabledMods).filter((mod) => mod.enabled)
      .length;
  },

  saveCurrentModsToProfile: () => {
    const { activeProfileId, profiles, localMods } = get();
    const profile = profiles[activeProfileId];

    if (!profile) {
      logger
        .withMetadata({ activeProfileId })
        .error("Cannot save mods: active profile not found");
      return;
    }

    logger
      .withMetadata({
        profileId: activeProfileId,
        modsCount: localMods.length,
      })
      .info("Saving current mods to profile");

    set((state) => ({
      profiles: {
        ...state.profiles,
        [activeProfileId]: {
          ...profile,
          mods: [...localMods],
        },
      },
    }));
  },

  loadModsFromProfile: (profileId: ProfileId) => {
    const { profiles } = get();
    const profile = profiles[profileId];

    if (!profile) {
      logger
        .withMetadata({ profileId })
        .error("Cannot load mods: profile not found");
      return;
    }

    logger
      .withMetadata({
        profileId,
        modsCount: profile.mods.length,
      })
      .info("Loading mods from profile");

    set({ localMods: [...profile.mods] });
  },

  syncProfileEnabledMods: async (profileId: ProfileId) => {
    try {
      const { profiles, localMods } = get();
      const profile = profiles[profileId];

      if (!profile) {
        logger.withMetadata({ profileId }).error("Profile not found for sync");
        return;
      }

      logger
        .withMetadata({
          profileId,
          folderName: profile.folderName,
        })
        .info("Syncing profile enabled mods with filesystem");

      const allVpks = await invoke<string[]>("get_profile_installed_vpks", {
        profileFolder: profile.folderName,
      });

      logger
        .withMetadata({
          profileId,
          count: allVpks.length,
          vpks: allVpks,
        })
        .info("Found VPKs in profile folder");

      // Enabled VPKs follow the pattern pak##_dir.vpk
      // Disabled (prefixed) VPKs follow the pattern {modid}_*.vpk
      const enabledVpkPattern = /^pak\d+_dir\.vpk$/i;
      const enabledVpkSet = new Set(
        allVpks.filter((vpk) => enabledVpkPattern.test(vpk)),
      );

      const updatedEnabledMods: Record<string, ModProfileEntry> = {};
      const updatedLocalMods: LocalMod[] = [];

      for (const mod of localMods) {
        // Check if this mod has any VPKs in the profile folder (enabled or disabled)
        const hasVpksInProfile = allVpks.some(
          (vpk) => vpk.startsWith(`${mod.remoteId}_`) || enabledVpkSet.has(vpk),
        );

        if (!hasVpksInProfile) {
          // Mod doesn't have any VPKs in this profile
          updatedLocalMods.push(mod);
          continue;
        }

        // Check if the mod has enabled VPKs
        const hasEnabledVpks =
          mod.installedVpks?.some((installedVpk) => {
            const filename = installedVpk.split(/[\\/]/).pop() || "";
            return enabledVpkSet.has(filename);
          }) ?? false;

        if (hasEnabledVpks) {
          // Mod is enabled in this profile
          updatedEnabledMods[mod.remoteId] = {
            remoteId: mod.remoteId,
            enabled: true,
            lastModified: new Date(),
          };

          if (mod.status === ModStatus.Downloaded) {
            updatedLocalMods.push({
              ...mod,
              status: ModStatus.Installed,
            });
          } else {
            updatedLocalMods.push(mod);
          }
        } else {
          // Mod has VPKs but they're disabled (prefixed)
          if (mod.status === ModStatus.Installed) {
            updatedLocalMods.push({
              ...mod,
              status: ModStatus.Downloaded,
            });
          } else {
            updatedLocalMods.push(mod);
          }
        }
      }

      logger
        .withMetadata({
          profileId,
          enabledCount: Object.keys(updatedEnabledMods).length,
        })
        .info("Synced profile enabled mods");

      set((state) => ({
        localMods: updatedLocalMods,
        profiles: {
          ...state.profiles,
          [profileId]: {
            ...profile,
            enabledMods: updatedEnabledMods,
          },
        },
      }));
    } catch (error) {
      logger
        .withMetadata({ profileId })
        .withError(error)
        .error("Failed to sync profile enabled mods");
    }
  },

  syncProfilesWithFilesystem: async () => {
    try {
      const filesystemFolders = await invoke<string[]>("list_profile_folders");
      const state = get();
      const normalizedState = normalizeRecoveredProfileIds(
        state.profiles,
        state.activeProfileId,
      );

      if (normalizedState.changed) {
        set({
          profiles: normalizedState.profiles,
          activeProfileId: normalizedState.activeProfileId,
        });

        logger.info("Normalized recovered profile IDs from filesystem folders");
      }

      const { profiles, activeProfileId } = normalizedState;

      const filesystemFoldersSet = new Set(filesystemFolders);
      const knownFolders = new Set(
        Object.values(profiles)
          .map((p) => p.folderName)
          .filter((name): name is string => name !== null),
      );

      const unknownFolders = filesystemFolders.filter(
        (folder) => !knownFolders.has(folder),
      );

      const profilesToRemove: ProfileId[] = [];
      let shouldSwitchToDefault = false;

      for (const [_, profile] of Object.entries(profiles)) {
        if (profile.isDefault) {
          continue;
        }

        if (
          profile.folderName &&
          !filesystemFoldersSet.has(profile.folderName)
        ) {
          profilesToRemove.push(profile.id as ProfileId);
          if (profile.id === activeProfileId) {
            shouldSwitchToDefault = true;
          }
        }
      }

      if (shouldSwitchToDefault) {
        logger.info(
          "Active profile no longer exists in filesystem, switching to default",
        );
        await get().switchToProfile(DEFAULT_PROFILE_ID);
      }

      if (profilesToRemove.length > 0) {
        logger
          .withMetadata({
            count: profilesToRemove.length,
            profileIds: profilesToRemove,
          })
          .info("Removing profiles that no longer exist in filesystem");

        set((state) => {
          const newProfiles = { ...state.profiles };
          for (const profileId of profilesToRemove) {
            delete newProfiles[profileId];
          }
          return { profiles: newProfiles };
        });
      }

      if (unknownFolders.length > 0) {
        logger
          .withMetadata({
            count: unknownFolders.length,
            folders: unknownFolders,
          })
          .info("Syncing unknown profile folders to state");

        const newProfiles: Record<ProfileId, ModProfile> = {};

        for (const folderName of unknownFolders) {
          const { profileId, displayName } =
            getRecoveredProfileDetails(folderName);
          const existingProfile = profiles[profileId];

          newProfiles[profileId] = existingProfile
            ? {
                ...existingProfile,
                folderName,
                name: shouldReplaceRecoveredProfileName(existingProfile)
                  ? displayName
                  : existingProfile.name,
              }
            : {
                id: profileId,
                name: displayName,
                description: RECOVERED_PROFILE_DESCRIPTION,
                createdAt: new Date(),
                lastUsed: new Date(),
                enabledMods: {},
                isDefault: false,
                folderName,
                mods: [],
              };
        }

        set((state) => ({
          profiles: {
            ...state.profiles,
            ...newProfiles,
          },
        }));

        logger
          .withMetadata({ count: Object.keys(newProfiles).length })
          .info("Added unknown profiles to state");
      }
    } catch (error) {
      logger.withError(error).error("Failed to sync profiles with filesystem");
    }
  },
});
