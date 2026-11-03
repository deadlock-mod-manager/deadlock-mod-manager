import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  CheckCircle,
  CircleSlash,
  FileStack,
  ShieldAlert,
  XCircle,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import type { RecapAction } from "@/components/my-mods/recap-row-action";
import { asItems, RecapSection } from "@/components/my-mods/recap-section";
import type { EnableAllRecap } from "@/hooks/use-enable-all-mods";
import { useInstallAction } from "@/hooks/use-install-action";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

type EnableAllRecapDialogProps = {
  recap: EnableAllRecap | null;
  onClose: () => void;
};

export const EnableAllRecapDialog = ({
  recap,
  onClose,
}: EnableAllRecapDialogProps) => {
  const { t } = useTranslation();
  const {
    performInstall,
    currentFileTree,
    showFileSelector,
    confirmInstallation,
    cancelInstallation,
    currentMod,
  } = useInstallAction();
  const installing = usePersistedStore((state) =>
    state.localMods.some((mod) => mod.status === ModStatus.Installing),
  );

  if (!recap) return null;

  const action = (label: string): RecapAction => ({
    label,
    available: !installing && !showFileSelector,
    enable: (mod) => void performInstall(mod),
  });

  const leftDisabled =
    recap.failed.length +
    recap.needsFileSelection.length +
    recap.criticalPaths.length +
    recap.keptCurrent.length +
    recap.replaced.length +
    recap.notAttempted.length;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className='flex max-h-[80vh] max-w-xl flex-col'>
          <DialogHeader>
            <DialogTitle>{t("myMods.enableAllRecap.title")}</DialogTitle>
            <DialogDescription>
              {leftDisabled === 0
                ? t("myMods.enableAllRecap.allEnabled", {
                    count: recap.enabled.length,
                  })
                : t("myMods.enableAllRecap.summary", {
                    enabled: recap.enabled.length,
                    count: leftDisabled,
                  })}
            </DialogDescription>
          </DialogHeader>

          <div className='-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1'>
            {recap.notAttempted.length > 0 && (
              <p className='rounded-md bg-muted p-3 text-sm text-muted-foreground'>
                {t("myMods.enableAllRecap.stoppedGameRunning")}
              </p>
            )}
            <RecapSection
              icon={<XCircle className='h-4 w-4 text-destructive' />}
              title={t("myMods.enableAllRecap.failed")}
              mods={recap.failed.map(({ mod, message }) => ({
                mod,
                detail: message,
              }))}
              action={action(t("myMods.enableAllRecap.retry"))}
            />
            <RecapSection
              icon={<FileStack className='h-4 w-4 text-amber-500' />}
              title={t("myMods.enableAllRecap.needsFileSelection")}
              hint={t("myMods.enableAllRecap.needsFileSelectionHint")}
              mods={asItems(recap.needsFileSelection)}
              action={action(t("myMods.enableAllRecap.chooseFiles"))}
            />
            <RecapSection
              icon={<ShieldAlert className='h-4 w-4 text-amber-500' />}
              title={t("myMods.enableAllRecap.criticalPaths")}
              hint={t("myMods.enableAllRecap.criticalPathsHint")}
              mods={asItems(recap.criticalPaths)}
              action={action(t("myMods.enableAllRecap.reviewAndEnable"))}
            />
            <RecapSection
              icon={<CircleSlash className='h-4 w-4 text-muted-foreground' />}
              title={t("myMods.enableAllRecap.notAttempted")}
              mods={asItems(recap.notAttempted)}
              action={action(t("myMods.enableAllRecap.enable"))}
            />
            <RecapSection
              icon={<CircleSlash className='h-4 w-4 text-muted-foreground' />}
              title={t("modelConflict.keptCurrent")}
              mods={asItems(recap.keptCurrent)}
            />
            <RecapSection
              icon={<CircleSlash className='h-4 w-4 text-muted-foreground' />}
              title={t("modelConflict.replaced")}
              mods={asItems(recap.replaced)}
            />
            <RecapSection
              icon={<CheckCircle className='h-4 w-4 text-green-500' />}
              title={t("myMods.enableAllRecap.enabled")}
              mods={asItems(recap.enabled)}
            />
          </div>

          <DialogFooter>
            <Button onClick={onClose}>
              {t("myMods.enableAllRecap.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FileSelectorDialog
        fileTree={currentFileTree}
        isOpen={showFileSelector}
        modName={currentMod?.name}
        onCancel={cancelInstallation}
        onConfirm={confirmInstallation}
        onOpenChange={(open) => {
          if (!open) {
            cancelInstallation();
          }
        }}
      />
    </>
  );
};
