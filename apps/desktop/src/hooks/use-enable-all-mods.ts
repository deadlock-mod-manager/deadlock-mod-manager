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
  keptCurrent: LocalMod[];
  replaced: LocalMod[];
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
    mutationKey: ["library-bulk"],
    mutationFn: async (selectedIds?: ReadonlySet<string>) => {
      const profileId = usePersistedStore.getState().activeProfileId;
      const disabledMods = mods.filter(
        (mod) =>
          mod.status === ModStatus.Downloaded &&
          (!selectedIds || selectedIds.has(mod.remoteId)),
      );
      if (disabledMods.length === 0) return;
      const shouldEnable = await confirm({
        title: t(
          selectedIds
            ? "myMods.selection.enableTitle"
            : "myMods.enableAllConfirmTitle",
          {
            count: disabledMods.length,
          },
        ),
        body: t(
          selectedIds
            ? "myMods.selection.enableBody"
            : "myMods.enableAllConfirmBody",
          { count: disabledMods.length },
        ),
        actionButton: t(
          selectedIds
            ? "myMods.selection.enable"
            : "myMods.enableAllConfirmAction",
        ),
        cancelButton: t("myMods.enableAllConfirmCancel"),
        icon: PowerIcon,
        actionButtonVariant: "default",
      });

      if (
        !shouldEnable ||
        usePersistedStore.getState().activeProfileId !== profileId
      )
        return;

      const result: EnableAllRecap = {
        enabled: [],
        failed: [],
        needsFileSelection: [],
        criticalPaths: [],
        keptCurrent: [],
        replaced: [],
        notAttempted: [],
      };

      for (const [index, mod] of disabledMods.entries()) {
        if (usePersistedStore.getState().activeProfileId !== profileId) {
          result.notAttempted = disabledMods.slice(index);
          break;
        }
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
          onCancel: (m, reason) => {
            setModStatus(m.remoteId, ModStatus.Downloaded);
            if (reason === "modelConflict") result.keptCurrent.push(m);
            else result.needsFileSelection.push(m);
          },
        });

        // Every remaining mod would raise the same game-running prompt.
        if (gameRunning) {
          result.notAttempted = disabledMods.slice(index);
          break;
        }
      }

      const active = new Set(
        usePersistedStore
          .getState()
          .localMods.filter((mod) => mod.status === ModStatus.Installed)
          .map((mod) => mod.remoteId),
      );
      result.replaced = result.enabled.filter(
        (mod) => !active.has(mod.remoteId),
      );
      result.enabled = result.enabled.filter((mod) => active.has(mod.remoteId));
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
