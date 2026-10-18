import { PowerIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import useInstallWithCollection from "@/hooks/use-install-with-collection";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";

export type EnableAllRecap = {
  enabled: LocalMod[];
  failed: { mod: LocalMod; message: string }[];
  needsFileSelection: LocalMod[];
  criticalPaths: LocalMod[];
  /** Left untouched after the user kept the game-running guard in place. */
  notAttempted: LocalMod[];
};

export const useEnableAllMods = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const mods = usePersistedStore((state) => state.localMods);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const setInstalledVpks = usePersistedStore((state) => state.setInstalledVpks);
  const setModEnabledInCurrentProfile = usePersistedStore(
    (state) => state.setModEnabledInCurrentProfile,
  );
  const { install } = useInstallWithCollection();
  const [recap, setRecap] = useState<EnableAllRecap | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const disabledMods = mods.filter(
        (mod) => mod.status === ModStatus.Downloaded,
      );
      const shouldEnable = await confirm({
        title: t("myMods.enableAllConfirmTitle", {
          count: disabledMods.length,
        }),
        body: t("myMods.enableAllConfirmBody"),
        actionButton: t("myMods.enableAllConfirmAction"),
        cancelButton: t("myMods.enableAllConfirmCancel"),
        icon: PowerIcon,
        actionButtonVariant: "default",
      });

      if (!shouldEnable) return;

      const result: EnableAllRecap = {
        enabled: [],
        failed: [],
        needsFileSelection: [],
        criticalPaths: [],
        notAttempted: [],
      };

      for (const [index, mod] of disabledMods.entries()) {
        // These ask for confirmation one by one, so a batch leaves them alone.
        if (mod.usesCriticalPaths) {
          result.criticalPaths.push(mod);
          continue;
        }

        let gameRunning = false;
        await install(mod, {
          analyticsEntryPoint: "library",
          analyticsOperationKind: "enable",
          skipFileSelection: true,
          onStart: (m) => setModStatus(m.remoteId, ModStatus.Installing),
          onComplete: (m, installed) => {
            setModStatus(m.remoteId, ModStatus.Installed);
            setInstalledVpks(
              m.remoteId,
              installed.installed_vpks,
              installed.file_tree,
            );
            setModEnabledInCurrentProfile(m.remoteId, true);
            result.enabled.push(m);
          },
          onError: (m, error) => {
            setModStatus(m.remoteId, ModStatus.Downloaded);
            if (error.kind === "gameRunning") {
              gameRunning = true;
              return;
            }
            result.failed.push({
              mod: m,
              message: error.message || t("notifications.failedToInstallMod"),
            });
          },
          onCancel: (m) => {
            setModStatus(m.remoteId, ModStatus.Downloaded);
            result.needsFileSelection.push(m);
          },
        });

        // Every remaining mod would raise the same game-running prompt.
        if (gameRunning) {
          result.notAttempted = disabledMods.slice(index);
          break;
        }
      }

      setRecap(result);
    },
  });

  return {
    enableAll: mutation.mutate,
    isPending: mutation.isPending,
    recap,
    closeRecap: () => setRecap(null),
  };
};
