import { analytics, captureMilestone } from "@/lib/analytics";
import { failureOutcome } from "@/lib/analytics/client";
import type { AnalyticsAttempt } from "@/lib/analytics/schema";
import { isTauriError } from "@/types/tauri";
import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import type { TFunction } from "i18next";
import logger from "@/lib/logger";
import {
  collectImportFailures,
  summarizeImportFailures,
} from "@/lib/profiles/import-failures";
import { prepareProfileImportMods } from "@/lib/profiles/import-profile-prep";
import { resolveImportContext } from "@/lib/profiles/import-profile-shared";
import type {
  ImportProgress,
  ImportedModDownloads,
  PreparedProfileImportMod,
  ProfileImportOptions,
  ProfileImportOutcome,
} from "@/lib/profiles/types";
import type { State } from "@/lib/store";
import type { ProfileImportResult } from "@/types/mods";
import type { ModProfile } from "@/types/profiles";
import { createProfileId } from "@/types/profiles";
import { invokeGuarded } from "@/lib/game-guard";

export interface ProfileImportFlowDeps {
  setImportProgress: (progress: ImportProgress | null) => void;
  t: TFunction;
  upsertProfile: State["upsertProfile"];
  createImportProfileFolder: State["createImportProfileFolder"];
  applyImportInstalledModsToProfile: State["applyImportInstalledModsToProfile"];
  setProfileFolderName: State["setProfileFolderName"];
  getProfile: State["getProfile"];
  getActiveProfile: State["getActiveProfile"];
  fileserverPreference: State["fileserverPreference"];
}

const downloadsByRemoteId = (
  preparedMods: PreparedProfileImportMod[],
): Map<string, ImportedModDownloads> =>
  new Map(
    preparedMods.map((entry) => [
      entry.profileImportMod.modId,
      entry.downloads,
    ]),
  );

export const createProfileImportFlow = (deps: ProfileImportFlowDeps) => {
  const {
    setImportProgress,
    t,
    upsertProfile,
    createImportProfileFolder,
    applyImportInstalledModsToProfile,
    setProfileFolderName,
    getActiveProfile,
    fileserverPreference,
  } = deps;

  /** Records the attempt and reports which mods didn't make it in. */
  const finishImport = (
    context: ReturnType<typeof resolveImportContext>,
    attempt: AnalyticsAttempt<"profile_import">,
    preparationFailed: [string, string][],
    result: ProfileImportResult,
    messages: { failure: string; success: string },
  ) => {
    const totalCount = context.importedMods.length;
    const importedCount = result.installedMods.length;
    const recorded = attempt.finish(
      importedCount === totalCount
        ? "completed"
        : importedCount > 0
          ? "partial"
          : "failed",
      {
        imported_mod_count: importedCount,
        unavailable_mod_count: context.unavailableModsCount,
      },
    );
    if (recorded && importedCount > 0)
      captureMilestone("first_install_completed");
    setImportProgress(null);

    const failures = collectImportFailures(
      context.importedMods,
      context.modsDataByRemoteId,
      preparationFailed,
      result.failed,
    );
    if (failures.length > 0) {
      logger
        .withMetadata({
          failed: result.failed.length,
          succeeded: result.succeeded.length,
          unavailable: context.unavailableModsCount,
          preparationFailed: preparationFailed.length,
        })
        .warn(`${messages.failure}: ${summarizeImportFailures(failures)}`);
    } else {
      toast.success(messages.success);
    }
    return { importedCount, totalCount, failures };
  };

  const createProfileFromImport = async (
    importedProfile: SharedProfile,
    modsData: ModDto[],
    options?: ProfileImportOptions,
  ): Promise<ProfileImportOutcome> => {
    const context = resolveImportContext(importedProfile, modsData);
    const { availableImportedMods, modsDataByRemoteId, unavailableModsCount } =
      context;

    const totalImportedMods = context.importedMods.length;
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

    const attempt = analytics.start("profile_import", {
      destination: "new_profile",
      mod_count: totalImportedMods,
    });
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
      const profileName =
        options?.profileName ??
        t("profiles.importedProfileName", {
          date: new Date().toLocaleDateString(),
        });
      const profileDescription =
        options?.profileDescription ?? t("profiles.importedProfileDescription");
      const folderName = await createImportProfileFolder(
        createdProfileId,
        profileName,
      );

      const newProfile: ModProfile = {
        id: createdProfileId,
        name: profileName,
        description: profileDescription,
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
        result = await invokeGuarded<ProfileImportResult>(
          "import_profile_batch",
          {
            profileName,
            profileDescription,
            profileFolder: folderName,
            mods: preparedMods.map((entry) => entry.profileImportMod),
            importType: "override",
            fileserverPreference,
          },
        );

        if (result.profileFolder && result.profileFolder !== folderName) {
          setProfileFolderName(createdProfileId, result.profileFolder);
        }
      }

      if (result.installedMods.length > 0) {
        applyImportInstalledModsToProfile(
          createdProfileId,
          result.installedMods,
          modsDataByRemoteId,
          downloadsByRemoteId(preparedMods),
        );
      }

      return {
        profileId: createdProfileId,
        profileName,
        ...finishImport(context, attempt, preparationFailed, result, {
          failure: "Some mods failed to import",
          success: t("profiles.createSuccess", { profileName }),
        }),
      };
    } catch (error) {
      attempt.finish(
        failureOutcome(isTauriError(error) ? error.kind : undefined),
      );
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
  ): Promise<ProfileImportOutcome> => {
    const activeProfile = getActiveProfile();
    if (!activeProfile) {
      throw new Error("No active profile found");
    }

    const context = resolveImportContext(importedProfile, modsData);
    const { availableImportedMods, modsDataByRemoteId, unavailableModsCount } =
      context;

    const totalImportedMods = context.importedMods.length;
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

    const attempt = analytics.start("profile_import", {
      destination: "current_profile",
      mod_count: totalImportedMods,
    });
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
        result = await invokeGuarded<ProfileImportResult>(
          "import_profile_batch",
          {
            profileName: activeProfile.name,
            profileDescription: activeProfile.description || "",
            profileFolder: activeProfile.folderName || "",
            mods: preparedMods.map((entry) => entry.profileImportMod),
            importType: "override",
            fileserverPreference,
          },
        );

        applyImportInstalledModsToProfile(
          activeProfile.id,
          result.installedMods,
          modsDataByRemoteId,
          downloadsByRemoteId(preparedMods),
        );
      }

      return {
        profileId: activeProfile.id,
        profileName: activeProfile.name,
        ...finishImport(context, attempt, preparationFailed, result, {
          failure: "Some mods failed to import to current profile",
          success: t("profiles.overrideSuccess"),
        }),
      };
    } catch (error) {
      attempt.finish(
        failureOutcome(isTauriError(error) ? error.kind : undefined),
      );
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
