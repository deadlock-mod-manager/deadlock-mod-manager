import { type ModDto } from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import i18n from "i18next";
import type { StateCreator } from "zustand";
import { getMod } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { isInstalledModWithVpks } from "@/lib/mods/installed-helpers";
import { type LocalMod, ModStatus, type InstalledModInfo } from "@/types/mods";
import {
  createProfileId,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  type ModProfile,
  type ModProfileEntry,
  type ProfileId,
  type ProfileSwitchResult,
  type ProfileVpkFile,
  type ProfileVpkSnapshot,
  type SeedManifestEntry,
  type VpkManifest,
  type VpkManifestEntry,
} from "@/types/profiles";
import { applyToModsInProfile } from "../utils/mod-slice";

export interface ProfilesState {
  profiles: Record<ProfileId, ModProfile>;
  activeProfileId: ProfileId;
  isSwitching: boolean;
  profileSyncRevision: number;

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
  getEnabledModsCount: () => number;
  syncProfilesWithFilesystem: () => Promise<void>;
  bumpProfileSyncRevision: () => number;
  syncProfileEnabledMods: (profileId: ProfileId) => Promise<void>;
  restoreModsFromManifest: () => Promise<void>;
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

const placeholderModFromManifest = (
  modId: string,
  entry: VpkManifestEntry,
): LocalMod => {
  const now = new Date();
  const currentVpks = entry.currentVpks ?? [];
  const isEnabled = entry.enabled && currentVpks.length > 0;
  return {
    id: modId,
    remoteId: modId,
    name: modId,
    description: null,
    remoteUrl: "",
    category: "local",
    likes: 0,
    author: "",
    downloadable: false,
    remoteAddedAt: now,
    remoteUpdatedAt: now,
    tags: [],
    images: [],
    hero: null,
    isAudio: false,
    isMap: false,
    audioUrl: null,
    downloadCount: 0,
    isNSFW: false,
    isObsolete: false,
    isBlacklisted: false,
    blacklistReason: null,
    blacklistedAt: null,
    blacklistedBy: null,
    filesUpdatedAt: null,
    overrides: null,
    createdAt: now,
    updatedAt: now,
    status: isEnabled ? ModStatus.Installed : ModStatus.Downloaded,
    installedVpks: isEnabled ? currentVpks : [],
    installOrder: entry.order ?? undefined,
    downloadedAt: now,
  };
};

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
  profileSyncRevision: 0,

  bumpProfileSyncRevision: () => {
    const next = (get().profileSyncRevision ?? 0) + 1;
    set({ profileSyncRevision: next });
    return next;
  },

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
            mods: nextProfileMods,
          },
        },
      };

      if (updateActiveLocalMods) {
        nextPartial.localMods = nextLocalMods;
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

  getEnabledModsCount: () => {
    const { localMods } = get();
    return localMods.filter(isInstalledModWithVpks).length;
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
    const revision = get().bumpProfileSyncRevision();
    try {
      const { profiles } = get();
      const profile = profiles[profileId];

      if (!profile) {
        logger.withMetadata({ profileId }).error("Profile not found for sync");
        return;
      }

      const localMods = profile.mods;

      logger
        .withMetadata({
          profileId,
          folderName: profile.folderName,
          revision,
        })
        .info("Syncing profile enabled mods with filesystem");

      let allVpks: ProfileVpkFile[] = [];
      let manifest: VpkManifest = { version: 0, mods: {} };
      try {
        const snapshot = await invoke<ProfileVpkSnapshot>(
          "get_profile_vpk_snapshot",
          {
            profileFolder: profile.folderName,
          },
        );
        allVpks = snapshot.files;
        manifest = snapshot.manifest;
      } catch (error) {
        logger
          .withMetadata({ profileId, folderName: profile.folderName })
          .withError(error)
          .warn(
            "Failed to load VPK snapshot; falling back to filename-pattern detection",
          );
        try {
          allVpks = await invoke<ProfileVpkFile[]>(
            "get_profile_installed_vpks",
            {
              profileFolder: profile.folderName,
            },
          );
        } catch {
          allVpks = [];
        }
      }

      logger
        .withMetadata({
          profileId,
          count: allVpks.length,
          vpks: allVpks,
        })
        .info("Found VPKs in profile folder");

      const enabledVpkPattern = /^pak\d+_dir\.vpk$/i;
      const enabledVpkLocators = new Set(
        allVpks
          .filter((vpk) => enabledVpkPattern.test(vpk.filename))
          .map((vpk) => `${vpk.shard}:${vpk.filename}`),
      );
      const updatedEnabledMods: Record<string, ModProfileEntry> = {};
      const updatedLocalMods: LocalMod[] = [];
      const seedEntries: SeedManifestEntry[] = [];

      for (const mod of localMods) {
        const manifestEntry = manifest.mods[mod.remoteId];

        if (manifestEntry) {
          const currentVpks = manifestEntry.currentVpks ?? [];
          const hasEnabledVpks =
            manifestEntry.enabled &&
            currentVpks.length > 0 &&
            currentVpks.every((vpk) =>
              enabledVpkLocators.has(`${manifestEntry.shard}:${vpk}`),
            );

          if (hasEnabledVpks) {
            updatedEnabledMods[mod.remoteId] = {
              remoteId: mod.remoteId,
              enabled: true,
              lastModified: new Date(),
            };

            updatedLocalMods.push({
              ...mod,
              status: ModStatus.Installed,
              installedVpks: currentVpks,
              installOrder: manifestEntry.order ?? mod.installOrder,
            });
          } else {
            if (manifestEntry.enabled) {
              logger
                .withMetadata({
                  profileId,
                  remoteId: mod.remoteId,
                  currentVpks,
                  shard: manifestEntry.shard,
                  enabledVpkCount: enabledVpkLocators.size,
                  enabledVpkSample: Array.from(enabledVpkLocators).slice(0, 10),
                })
                .warn(
                  "Manifest entry marked enabled but no matching enabled VPKs on disk; treating as downloaded",
                );
            }

            updatedLocalMods.push({
              ...mod,
              status: ModStatus.Downloaded,
              installedVpks: [],
              installOrder: manifestEntry.order ?? mod.installOrder,
            });
          }

          continue;
        }

        const disabledVpksForMod = allVpks
          .filter(
            (vpk) =>
              vpk.shard === 1 && vpk.filename.startsWith(`${mod.remoteId}_`),
          )
          .map((vpk) => vpk.filename);
        const enabledVpkFilesForMod = allVpks.filter(
          (vpk) =>
            enabledVpkPattern.test(vpk.filename) &&
            (mod.installedVpks?.some((installedVpk) => {
              const normalized = installedVpk.replaceAll("\\", "/");
              return normalized.includes("/")
                ? normalized === vpk.locator
                : normalized === vpk.filename;
            }) ??
              false),
        );
        const enabledShards = new Set(
          enabledVpkFilesForMod.map((vpk) => vpk.shard),
        );
        const enabledShard =
          enabledShards.size === 1
            ? enabledVpkFilesForMod[0]?.shard
            : undefined;
        const enabledVpksForMod =
          enabledShard === undefined
            ? []
            : enabledVpkFilesForMod.map((vpk) => vpk.filename);

        const hasVpksInProfile =
          disabledVpksForMod.length > 0 || enabledVpksForMod.length > 0;

        if (!hasVpksInProfile) {
          // Mod doesn't have any VPKs in this profile
          updatedLocalMods.push(mod);
          continue;
        }

        // Check if the mod has enabled VPKs
        const hasEnabledVpks = enabledVpksForMod.length > 0;

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
              installedVpks: enabledVpksForMod,
            });
          } else {
            updatedLocalMods.push({
              ...mod,
              installedVpks: enabledVpksForMod,
            });
          }

          seedEntries.push({
            modId: mod.remoteId,
            enabled: true,
            shard: enabledShard ?? 1,
            currentVpks: enabledVpksForMod,
            disabledVpks: [],
            originalVpkNames: [],
            order: mod.installOrder ?? null,
          });
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

          seedEntries.push({
            modId: mod.remoteId,
            enabled: false,
            shard: 1,
            currentVpks: [],
            disabledVpks: disabledVpksForMod,
            originalVpkNames: [],
            order: mod.installOrder ?? null,
          });
        }
      }

      if (seedEntries.length > 0) {
        try {
          await invoke("seed_profile_vpk_manifest_entries", {
            profileFolder: profile.folderName,
            entries: seedEntries,
          });
          logger
            .withMetadata({ profileId, seedCount: seedEntries.length })
            .info("Seeded VPK manifest with legacy mod entries");
        } catch (seedError) {
          logger
            .withMetadata({ profileId })
            .withError(seedError)
            .warn("Failed to seed VPK manifest with legacy entries");
        }
      }

      logger
        .withMetadata({
          profileId,
          enabledCount: Object.keys(updatedEnabledMods).length,
        })
        .info("Synced profile enabled mods");

      set((state) => {
        if (state.profileSyncRevision !== revision) {
          logger
            .withMetadata({
              profileId,
              revision,
              current: state.profileSyncRevision,
            })
            .info("Dropping stale profile sync result");
          return state;
        }

        const next = applyToModsInProfile(
          state,
          profileId,
          () => updatedLocalMods,
        );
        const nextProfile = next.profiles[profileId];
        if (!nextProfile) {
          return next;
        }

        return {
          ...next,
          profiles: {
            ...next.profiles,
            [profileId]: {
              ...nextProfile,
              enabledMods: updatedEnabledMods,
            },
          },
        };
      });
    } catch (error) {
      logger
        .withMetadata({ profileId })
        .withError(error)
        .error("Failed to sync profile enabled mods");
    }
  },

  restoreModsFromManifest: async () => {
    const { activeProfileId, profiles } = get();
    const profile = profiles[activeProfileId];
    if (!profile) {
      return;
    }

    let snapshot: ProfileVpkSnapshot;
    try {
      snapshot = await invoke<ProfileVpkSnapshot>("get_profile_vpk_snapshot", {
        profileFolder: profile.folderName,
      });
    } catch (error) {
      logger.withError(error).warn("Failed to load snapshot for restoration");
      return;
    }

    const manifestEntries = Object.entries(snapshot.manifest.mods);
    if (manifestEntries.length === 0) {
      return;
    }

    const trackedById = new Map(
      profile.mods.map((mod) => [mod.remoteId, mod] as const),
    );
    const missingEntries = manifestEntries.filter(
      ([modId]) => !trackedById.has(modId),
    );
    if (missingEntries.length === 0) {
      return;
    }

    logger
      .withMetadata({
        profileId: activeProfileId,
        manifestModCount: manifestEntries.length,
        missingCount: missingEntries.length,
      })
      .info("Reconciling missing mods from manifest");

    const restoredMods: LocalMod[] = [...profile.mods];
    const enabledMods: Record<string, ModProfileEntry> = {
      ...profile.enabledMods,
    };

    for (const [modId, entry] of missingEntries) {
      let restoredMod: LocalMod;
      try {
        const modDetails = await getMod(modId);
        const currentVpks = entry.currentVpks ?? [];
        const isEnabled = entry.enabled && currentVpks.length > 0;
        restoredMod = {
          ...modDetails,
          status: isEnabled ? ModStatus.Installed : ModStatus.Downloaded,
          installedVpks: isEnabled ? currentVpks : [],
          installOrder: entry.order ?? restoredMods.length,
          downloadedAt: new Date(),
        };
      } catch (error) {
        logger
          .withMetadata({ modId })
          .withError(error)
          .warn("Using placeholder for unavailable catalog metadata");
        restoredMod = placeholderModFromManifest(modId, entry);
      }

      restoredMods.push(restoredMod);
      if (restoredMod.status === ModStatus.Installed) {
        enabledMods[modId] = {
          remoteId: modId,
          enabled: true,
          lastModified: new Date(),
        };
      }
    }

    set((state) => {
      const current = state.profiles[activeProfileId];
      if (!current) {
        return state;
      }
      const next = applyToModsInProfile(
        state,
        activeProfileId,
        () => restoredMods,
      );
      const nextProfile = next.profiles[activeProfileId];
      if (!nextProfile) {
        return next;
      }
      return {
        ...next,
        profiles: {
          ...next.profiles,
          [activeProfileId]: {
            ...nextProfile,
            enabledMods,
          },
        },
      };
    });

    logger
      .withMetadata({ restoredCount: missingEntries.length })
      .info("Manifest reconciliation complete");
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
