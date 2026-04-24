import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createProfileImportFlow } from "@/lib/profiles/import-profile";
import type { ImportProgress } from "@/lib/profiles/types";
import { usePersistedStore } from "@/lib/store";
import type { ProfileImportProgressEvent } from "@/types/mods";

export const useProfileImport = (options?: { listenToProgress?: boolean }) => {
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const { t } = useTranslation();
  const listenToProgress = options?.listenToProgress ?? true;

  const upsertProfile = usePersistedStore((s) => s.upsertProfile);
  const createImportProfileFolder = usePersistedStore(
    (s) => s.createImportProfileFolder,
  );
  const applyImportInstalledModsToProfile = usePersistedStore(
    (s) => s.applyImportInstalledModsToProfile,
  );
  const setProfileFolderName = usePersistedStore((s) => s.setProfileFolderName);
  const getProfile = usePersistedStore((s) => s.getProfile);
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);

  const { createProfileFromImport, addToCurrentProfile } = useMemo(
    () =>
      createProfileImportFlow({
        setImportProgress,
        t,
        upsertProfile,
        createImportProfileFolder,
        applyImportInstalledModsToProfile,
        setProfileFolderName,
        getProfile,
        getActiveProfile,
      }),
    [
      t,
      upsertProfile,
      createImportProfileFolder,
      applyImportInstalledModsToProfile,
      setProfileFolderName,
      getProfile,
      getActiveProfile,
    ],
  );

  useEffect(() => {
    if (!listenToProgress) {
      return;
    }

    const unlistenPromise = listen<ProfileImportProgressEvent>(
      "profile-import-progress",
      (event) => {
        const progress = event.payload;
        setImportProgress({
          currentStep: progress.currentStep,
          currentMod: progress.currentModName || undefined,
          completedMods: progress.currentModIndex,
          totalMods: progress.totalMods,
          isDownloading: progress.currentStep === "downloading",
          isInstalling: progress.currentStep === "installing",
        });
      },
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [listenToProgress]);

  return {
    createProfileFromImport,
    addToCurrentProfile,
    importProgress,
  };
};
