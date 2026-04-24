import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import type { TFunction } from "i18next";
import logger from "@/lib/logger";
import { prepareProfileImportMods } from "@/lib/profiles/import-profile-prep";
import { resolveImportContext } from "@/lib/profiles/import-profile-shared";
import type {
  ImportProgress,
  ProfileImportOptions,
} from "@/lib/profiles/types";
import type { State } from "@/lib/store";
import type { ProfileImportResult } from "@/types/mods";
import type { ModProfile, ProfileId } from "@/types/profiles";
import { createProfileId } from "@/types/profiles";

export interface ProfileImportFlowDeps {
  setImportProgress: (progress: ImportProgress | null) => void;
  t: TFunction;
  upsertProfile: State["upsertProfile"];
  createImportProfileFolder: State["createImportProfileFolder"];
  applyImportInstalledModsToProfile: State["applyImportInstalledModsToProfile"];
  setProfileFolderName: State["setProfileFolderName"];
  getProfile: State["getProfile"];
  getActiveProfile: State["getActiveProfile"];
}

export const createProfileImportFlow = (deps: ProfileImportFlowDeps) => {
  const {
    setImportProgress,
    t,
    upsertProfile,
    createImportProfileFolder,
    applyImportInstalledModsToProfile,
    setProfileFolderName,
    getActiveProfile,
  } = deps;

  const createProfileFromImport = async (
    importedProfile: SharedProfile,
    modsData: ModDto[],
    _options?: ProfileImportOptions,
  ): Promise<void> => {
    const {
      importedMods,
      availableImportedMods,
      installOrderByRemoteId,
      modsDataByRemoteId,
      unavailableModsCount,
    } = resolveImportContext(importedProfile, modsData);

    const totalImportedMods = importedMods.length;
    if (totalImportedMods === 0) {
      throw new Error("No mods available in imported profile");
    }

    logger
      .withMetadata({
        importedModsCount: totalImportedMods,
        availableModsCount: availableImportedMods.length,
        unavailableModsCount,
      })
      .info("Starting profile import");

    let newProfileId: ProfileId | null = null;

    try {
      setImportProgress({
        currentStep: t("profiles.creatingProfile"),
        completedMods: 0,
        totalMods: totalImportedMods,
        isDownloading: false,
        isInstalling: false,
      });

      const profileId = `profile_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const createdProfileId = createProfileId(profileId);
      newProfileId = createdProfileId;
      const profileName = t("profiles.importedProfileName", {
        date: new Date().toLocaleDateString(),
      });
      const folderName = await createImportProfileFolder(
        createdProfileId,
        profileName,
      );

      const newProfile: ModProfile = {
        id: createdProfileId,
        name: profileName,
        description: t("profiles.importedProfileDescription"),
        createdAt: new Date(),
        lastUsed: new Date(),
        enabledMods: {},
        isDefault: false,
        folderName,
        mods: [],
      };

      upsertProfile(newProfile);

      const { preparedMods, failed: preparationFailed } =
        await prepareProfileImportMods(availableImportedMods);

      let result: ProfileImportResult = {
        profileFolder: folderName,
        succeeded: [],
        failed: [],
        installedMods: [],
      };

      if (preparedMods.length > 0) {
        result = await invoke<ProfileImportResult>("import_profile_batch", {
          profileName,
          profileDescription: t("profiles.importedProfileDescription"),
          profileFolder: folderName,
          mods: preparedMods.map((entry) => entry.profileImportMod),
          importType: "override",
        });

        if (result.profileFolder && result.profileFolder !== folderName) {
          setProfileFolderName(newProfileId, result.profileFolder);
        }
      }

      if (result.installedMods.length > 0) {
        applyImportInstalledModsToProfile(
          newProfileId,
          result.installedMods,
          modsDataByRemoteId,
          installOrderByRemoteId,
        );
      }

      const missingCount =
        totalImportedMods -
        result.installedMods.length -
        (totalImportedMods - preparedMods.length - unavailableModsCount);

      setImportProgress(null);

      if (
        result.failed.length > 0 ||
        preparationFailed.length > 0 ||
        unavailableModsCount > 0
      ) {
        logger
          .withMetadata({
            failed: result.failed.length,
            succeeded: result.succeeded.length,
            unavailable: unavailableModsCount,
            preparationFailed: preparationFailed.length,
          })
          .warn("Some mods failed to import");
        const imported = result.installedMods.length;
        toast.warning(
          t("profiles.createSuccess", { profileName }) +
            ` (${t("profiles.modsImportedCount", { imported, total: totalImportedMods })})`,
        );
      } else {
        toast.success(t("profiles.createSuccess", { profileName }));
      }

      void missingCount;
    } catch (error) {
      logger.withError(error).error("Profile import failed");
      setImportProgress(null);
      toast.error(t("profiles.createError"));
      throw error;
    }
  };

  const addToCurrentProfile = async (
    importedProfile: SharedProfile,
    modsData: ModDto[],
    _options?: ProfileImportOptions,
  ): Promise<void> => {
    const activeProfile = getActiveProfile();
    if (!activeProfile) {
      throw new Error("No active profile found");
    }

    const {
      importedMods,
      availableImportedMods,
      installOrderByRemoteId,
      modsDataByRemoteId,
      unavailableModsCount,
    } = resolveImportContext(importedProfile, modsData);

    const totalImportedMods = importedMods.length;
    if (totalImportedMods === 0) {
      throw new Error("No mods available in imported profile");
    }

    logger
      .withMetadata({
        profileId: activeProfile.id,
        importedModsCount: totalImportedMods,
        availableModsCount: availableImportedMods.length,
        unavailableModsCount,
      })
      .info("Overriding current profile with imported mods");

    try {
      setImportProgress({
        currentStep: t("profiles.updatingProfile"),
        completedMods: 0,
        totalMods: totalImportedMods,
        isDownloading: false,
        isInstalling: false,
      });

      const { preparedMods, failed: preparationFailed } =
        await prepareProfileImportMods(availableImportedMods);

      let result: ProfileImportResult = {
        profileFolder: activeProfile.folderName || "",
        succeeded: [],
        failed: [],
        installedMods: [],
      };

      if (preparedMods.length > 0) {
        result = await invoke<ProfileImportResult>("import_profile_batch", {
          profileName: activeProfile.name,
          profileDescription: activeProfile.description || "",
          profileFolder: activeProfile.folderName || "",
          mods: preparedMods.map((entry) => entry.profileImportMod),
          importType: "override",
        });

        applyImportInstalledModsToProfile(
          activeProfile.id,
          result.installedMods,
          modsDataByRemoteId,
          installOrderByRemoteId,
        );
      }

      setImportProgress(null);

      if (
        result.failed.length > 0 ||
        preparationFailed.length > 0 ||
        unavailableModsCount > 0
      ) {
        logger
          .withMetadata({
            failed: result.failed.length,
            succeeded: result.succeeded.length,
            unavailable: unavailableModsCount,
            preparationFailed: preparationFailed.length,
          })
          .warn("Some mods failed to import to current profile");
        const imported = result.installedMods.length;
        toast.warning(
          t("profiles.overrideSuccess") +
            ` (${t("profiles.modsImportedCount", { imported, total: totalImportedMods })})`,
        );
      } else {
        toast.success(t("profiles.overrideSuccess"));
      }
    } catch (error) {
      logger.withError(error).error("Profile import failed");
      setImportProgress(null);
      toast.error(t("profiles.updateError"));
      throw error;
    }
  };

  return {
    createProfileFromImport,
    addToCurrentProfile,
  };
};
