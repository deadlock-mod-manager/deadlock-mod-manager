import { toast } from "@deadlock-mods/ui/components/sonner";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import useInstallWithCollection from "@/hooks/use-install-with-collection";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, type ModFileTree, ModStatus } from "@/types/mods";

export type UseInstallActionReturn = {
  performInstall: (mod: LocalMod) => Promise<void>;
  isAnalyzing: boolean;
  currentFileTree: ModFileTree | null;
  showFileSelector: boolean;
  confirmInstallation: (fileTree: ModFileTree) => Promise<void>;
  cancelInstallation: () => void;
  currentMod: LocalMod | null;
};

export const useInstallAction = (): UseInstallActionReturn => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const setInstalledVpks = usePersistedStore((state) => state.setInstalledVpks);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const setModEnabledInCurrentProfile = usePersistedStore(
    (state) => state.setModEnabledInCurrentProfile,
  );
  const {
    install,
    isAnalyzing,
    currentFileTree,
    showFileSelector,
    confirmInstallation,
    cancelInstallation,
    currentMod,
  } = useInstallWithCollection();

  const performInstall = useCallback(
    async (mod: LocalMod) => {
      if (mod.usesCriticalPaths) {
        const confirmed = await confirm({
          title: t("criticalPaths.title"),
          body: t("criticalPaths.body"),
          tone: "destructive",
          cancelButton: t("criticalPaths.cancel"),
          actionButton: t("criticalPaths.confirm"),
        });
        if (!confirmed) {
          return;
        }
      }

      await install(mod, {
        onStart: (m) => {
          setModStatus(m.remoteId, ModStatus.Installing);
        },
        onComplete: (m, result) => {
          setModStatus(m.remoteId, ModStatus.Installed);
          setInstalledVpks(m.remoteId, result.installed_vpks, result.file_tree);
          setModEnabledInCurrentProfile(m.remoteId, true);
          toast.success(t("notifications.modInstalledSuccessfully"));
        },
        onError: (m, error) => {
          setModStatus(m.remoteId, ModStatus.Downloaded);
          toast.error(error.message || t("notifications.failedToInstallMod"));
        },
        onCancel: (m) => {
          setModStatus(m.remoteId, ModStatus.Downloaded);
          toast.info(t("notifications.installationCanceled"));
        },
        onFileTreeAnalyzed: (m, fileTree) => {
          if (fileTree.has_multiple_files) {
            toast.info(
              t("notifications.modContainsFiles", {
                modName: m.name,
                fileCount: fileTree.total_files,
              }),
            );
          }
        },
      });
    },
    [
      install,
      setModStatus,
      setInstalledVpks,
      setModEnabledInCurrentProfile,
      t,
      confirm,
    ],
  );

  return {
    performInstall,
    isAnalyzing,
    currentFileTree,
    showFileSelector,
    confirmInstallation,
    cancelInstallation,
    currentMod,
  };
};
