import { invoke } from "@tauri-apps/api/core";
import type { StateCreator } from "zustand";
import logger from "@/lib/logger";
import { ModStatus } from "@/types/mods";
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

  createProfile: (name: string, description?: string) => ProfileId;
  deleteProfile: (profileId: ProfileId) => boolean;
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
}

const createDefaultProfile = (): ModProfile => ({
  id: DEFAULT_PROFILE_ID,
  name: DEFAULT_PROFILE_NAME,
  description: "The default mod profile",
  createdAt: new Date(),
  lastUsed: new Date(),
  enabledMods: {},
  isDefault: true,
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

  createProfile: (name: string, description?: string) => {
    const profileId = createProfileId(
      `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    );
    const newProfile: ModProfile = {
      id: profileId,
      name: name.trim(),
      description: description?.trim(),
      createdAt: new Date(),
      enabledMods: {},
      isDefault: false,
    };

    set((state) => ({
      profiles: {
        ...state.profiles,
        [profileId]: newProfile,
      },
    }));

    return profileId;
  },

  deleteProfile: (profileId: ProfileId) => {
    const { profiles, activeProfileId } = get();
    const profile = profiles[profileId];

    if (!profile || profile.isDefault) {
      return false; // Cannot delete default profile or non-existent profile
    }

    const newProfiles = { ...profiles };
    delete newProfiles[profileId];

    set((state) => ({
      profiles: newProfiles,
      // If deleting the active profile, switch to default
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
    const { profiles, activeProfileId, localMods, setModStatus } = state;
    const targetProfile = profiles[profileId];

    if (!targetProfile || profileId === activeProfileId) {
      logger.error("Profile not found or already active", { profileId });
      return {
        disabledMods: [],
        enabledMods: [],
        errors: targetProfile ? [] : [`Profile ${profileId} not found`],
      };
    }

    // Safety check: ensure we have localMods before proceeding
    if (!localMods || localMods.length === 0) {
      logger.error("No local mods found, skipping profile switch");
      return {
        disabledMods: [],
        enabledMods: [],
        errors: ["No local mods found"],
      };
    }

    logger.info("Switching to profile", { profileId });
    set({ isSwitching: true });

    const result: ProfileSwitchResult = {
      disabledMods: [],
      enabledMods: [],
      errors: [],
    };

    try {
      // Step 1: Disable all currently enabled mods by removing their VPK files
      logger.info("Step 1: Disabling all currently installed mods", {
        installedModsCount: localMods.filter(
          (m) => m.status === ModStatus.Installed,
        ).length,
      });

      for (const mod of localMods) {
        if (mod.status === ModStatus.Installed && mod.installedVpks) {
          try {
            logger.info("Disabling mod", {
              modId: mod.remoteId,
              vpks: mod.installedVpks,
            });
            await invoke("uninstall_mod", {
              modId: mod.remoteId,
              vpks: mod.installedVpks,
            });
            setModStatus(mod.remoteId, ModStatus.Downloaded);
            result.disabledMods.push(mod.remoteId);
          } catch (error) {
            logger.error("Failed to disable mod", {
              modId: mod.remoteId,
              error,
            });
            result.errors.push(
              `Failed to disable mod ${mod.remoteId}: ${error}`,
            );
          }
        }
      }

      // Step 2: Enable mods that should be active in the target profile by installing their VPK files
      const modsToEnable = Object.entries(targetProfile.enabledMods).filter(
        ([, entry]) => entry.enabled,
      );

      logger.info("Step 2: Enabling mods for target profile", {
        targetProfileId: profileId,
        modsToEnableCount: modsToEnable.length,
        modsToEnable: modsToEnable.map(([remoteId]) => remoteId),
      });

      for (const [remoteId, profileEntry] of modsToEnable) {
        if (profileEntry.enabled) {
          const localMod = localMods.find((m) => m.remoteId === remoteId);
          if (
            localMod &&
            (localMod.status === ModStatus.Downloaded ||
              localMod.status === ModStatus.Installed) &&
            localMod.path
          ) {
            try {
              logger.info("Enabling mod", {
                modId: localMod.remoteId,
                path: localMod.path,
                installedVpks: localMod.installedVpks,
                fileTree: localMod.installedFileTree,
              });
              await invoke("install_mod", {
                deadlockMod: {
                  id: localMod.remoteId,
                  name: localMod.name,
                  path: localMod.path,
                  installed_vpks: localMod.installedVpks || [],
                  file_tree: localMod.installedFileTree,
                },
              });

              setModStatus(localMod.remoteId, ModStatus.Installed);
              result.enabledMods.push(localMod.remoteId);
            } catch (error) {
              logger.error("Failed to enable mod", {
                modId: localMod.remoteId,
                error,
              });
              result.errors.push(
                `Failed to enable mod ${localMod.remoteId}: ${error}`,
              );
            }
          } else if (localMod && !localMod.path) {
            logger.warn("Mod found but has no path, skipping", {
              modId: localMod.remoteId,
              status: localMod.status,
            });
            result.errors.push(
              `Mod ${localMod.remoteId} has no installation path`,
            );
          } else if (!localMod) {
            logger.warn("Mod not found locally, skipping", {
              remoteId,
            });
            result.errors.push(`Mod ${remoteId} not found locally`);
          }
        }
      }

      // Step 3: Update active profile and mark as last used
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
    } finally {
      logger.info("Switching to profile complete", { profileId });
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

      const aLastUsed = a.lastUsed?.getTime() ?? 0;
      const bLastUsed = b.lastUsed?.getTime() ?? 0;

      if (aLastUsed !== bLastUsed) {
        return bLastUsed - aLastUsed; // Most recently used first
      }

      return b.createdAt.getTime() - a.createdAt.getTime(); // Most recently created first
    });
  },

  getProfilesCount: () => {
    const { profiles } = get();
    return Object.keys(profiles).length;
  },

  activeProfile: () => {
    const { activeProfileId, profiles } = get();
    return profiles[activeProfileId];
  },
});
