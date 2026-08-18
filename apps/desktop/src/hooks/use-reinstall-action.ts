import { toast } from "@deadlock-mods/ui/components/sonner";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { type ReinstallStep, useReinstallMod } from "@/hooks/use-reinstall-mod";
import { isLocalMod } from "@/lib/mods/installed-helpers";
import { type LocalMod, ModStatus } from "@/types/mods";

/** Nothing to reinstall while the mod is already busy doing something. */
const BUSY_STATUSES = new Set<ModStatus>([
  ModStatus.Downloading,
  ModStatus.Extracting,
  ModStatus.Paused,
  ModStatus.Installing,
  ModStatus.Removing,
]);

/**
 * Confirmation, progress and result reporting around {@link useReinstallMod},
 * so the card button and the context menu entry behave identically.
 */
export const useReinstallAction = (mod: LocalMod) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { reinstallMod } = useReinstallMod();
  const [step, setStep] = useState<ReinstallStep | null>(null);

  const isReinstalling = step !== null;
  const isBusy = isReinstalling || BUSY_STATUSES.has(mod.status);
  // A local mod has no source to download from, so a reinstall would only
  // delete it.
  const canReinstall = !isLocalMod(mod);

  const reinstall = useCallback(async () => {
    if (isBusy || !canReinstall) {
      return;
    }

    const confirmed = await confirm({
      title: t("reinstall.confirmTitle", { modName: mod.name }),
      body: t("reinstall.confirmBody"),
      actionButton: t("reinstall.action"),
      cancelButton: t("common.cancel"),
    });
    if (!confirmed) {
      return;
    }

    setStep("purging");
    try {
      const result = await reinstallMod(mod, { onStep: setStep });

      switch (result.outcome) {
        case "restored":
        case "downloadedOnly":
          toast.success(t("reinstall.success", { modName: mod.name }));
          break;
        case "manual":
          toast.info(t("reinstall.needsFileSelection", { modName: mod.name }));
          break;
        case "failed":
          toast.error(
            result.error
              ? t("reinstall.failedWithReason", {
                  modName: mod.name,
                  reason: result.error,
                })
              : t("reinstall.failed", { modName: mod.name }),
          );
          break;
      }
    } finally {
      setStep(null);
    }
  }, [canReinstall, confirm, isBusy, mod, reinstallMod, t]);

  const label = step ? t(`reinstall.step.${step}`) : t("reinstall.action");

  return { reinstall, isReinstalling, isBusy, canReinstall, step, label };
};
