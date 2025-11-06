import { invoke } from "@tauri-apps/api/core";
import type { StateCreator } from "zustand";
import logger from "@/lib/logger";
import { type LocalMod, ModStatus } from "@/types/mods";
import {
  createProfileId,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  type ModProfile,
  type ModProfileEntry,
  type ProfileId,
  type ProfileSwitchResult,
} from "@/types/profiles";
import type { State } from "..";

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

export const createProfilesSlice: StateCreator<State, [], [], ProfilesState> = (
  set,
  get,
) => ({
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
      logger.info("Created profile folder", { profileId, folderName });
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
      logger.error("Failed to create profile folder", { profileId, error });
      return null;
    }
  },

  deleteProfile: async (profileId: ProfileId) => {
    const { profiles, activeProfileId } = get();
    const profile = profiles[profileId];

    if (!profile || profile.isDefault) {
      return false;
    }

    if (profile.folderName) {
      try {
        await invoke("delete_profile_folder", {
          profileFolder: profile.folderName,
        });
        logger.info("Deleted profile folder", {
          profileId,
          folderName: profile.folderName,
        });
      } catch (error) {
        logger.error("Failed to delete profile folder", {
          profileId,
          folderName: profile.folderName,
          error,
        });
      }
    }

    const newProfiles = { ...profiles };
    delete newProfiles[profileId];

    set((state) => ({
      profiles: newProfiles,
      activeProfileId:
        activeProfileId === profileId
          ? DEFAULT_PROFILE_ID
          : state.activeProfileId,
    }));

    return true;
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

  switchToProfile: async (profileId: ProfileId) => {
    logger.info("Switching to profile", { profileId });
    const state = get();
    const { profiles, activeProfileId } = state;
    const targetProfile = profiles[profileId];

    if (!targetProfile || profileId === activeProfileId) {
      logger.error("Profile not found or already active", { profileId });
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
      logger.info("Successfully switched profile gameinfo.gi path", {
        profileId,
        folderName: targetProfile.folderName,
      });

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
      logger.error("Failed to switch profile", { profileId, error });
      result.errors.push(`Failed to switch profile: ${error}`);
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

  activeProfile: () => {
    const { activeProfileId, profiles } = get();
    return profiles[activeProfileId];
  },

  saveCurrentModsToProfile: () => {
    const { activeProfileId, profiles, localMods } = get();
    const profile = profiles[activeProfileId];

    if (!profile) {
      logger.error("Cannot save mods: active profile not found", {
        activeProfileId,
      });
      return;
    }

    logger.info("Saving current mods to profile", {
      profileId: activeProfileId,
      modsCount: localMods.length,
    });

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
      logger.error("Cannot load mods: profile not found", { profileId });
      return;
    }

    logger.info("Loading mods from profile", {
      profileId,
      modsCount: profile.mods.length,
    });

    set({ localMods: [...profile.mods] });
  },

  syncProfileEnabledMods: async (profileId: ProfileId) => {
    try {
      const { profiles, localMods } = get();
      const profile = profiles[profileId];

      if (!profile) {
        logger.error("Profile not found for sync", { profileId });
        return;
      }

      logger.info("Syncing profile enabled mods with filesystem", {
        profileId,
        folderName: profile.folderName,
      });

      const allVpks = await invoke<string[]>("get_profile_installed_vpks", {
        profileFolder: profile.folderName,
      });

      logger.info("Found VPKs in profile folder", {
        profileId,
        count: allVpks.length,
        vpks: allVpks,
      });

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

      logger.info("Synced profile enabled mods", {
        profileId,
        enabledCount: Object.keys(updatedEnabledMods).length,
      });

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
      logger.error("Failed to sync profile enabled mods", { profileId, error });
    }
  },

  syncProfilesWithFilesystem: async () => {
    try {
      const filesystemFolders = await invoke<string[]>("list_profile_folders");
      const { profiles, activeProfileId } = get();

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

      for (const [profileId, profile] of Object.entries(profiles)) {
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
        logger.info("Removing profiles that no longer exist in filesystem", {
          count: profilesToRemove.length,
          profileIds: profilesToRemove,
        });

        set((state) => {
          const newProfiles = { ...state.profiles };
          for (const profileId of profilesToRemove) {
            delete newProfiles[profileId];
          }
          return { profiles: newProfiles };
        });
      }

      if (unknownFolders.length > 0) {
        logger.info("Syncing unknown profile folders to state", {
          count: unknownFolders.length,
          folders: unknownFolders,
        });

        const newProfiles: Record<ProfileId, ModProfile> = {};

        for (const folderName of unknownFolders) {
          const parts = folderName.split("_");
          const profileIdPart = parts[0];
          const namePart = parts.slice(1).join("_") || "Unknown Profile";

          const displayName = namePart
            .split(/[-_]/)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

          const profileId = createProfileId(profileIdPart);

          newProfiles[profileId] = {
            id: profileId,
            name: displayName,
            description: "Profile detected from filesystem",
            createdAt: new Date(),
            lastUsed: new Date(),
            enabledMods: {},
            isDefault: false,
            folderName: folderName,
            mods: [],
          };
        }

        set((state) => ({
          profiles: {
            ...state.profiles,
            ...newProfiles,
          },
        }));

        logger.info("Added unknown profiles to state", {
          count: Object.keys(newProfiles).length,
        });
      }
    } catch (error) {
      logger.error("Failed to sync profiles with filesystem", { error });
    }
  },
});
