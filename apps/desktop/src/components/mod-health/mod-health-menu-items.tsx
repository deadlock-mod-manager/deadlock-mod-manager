import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@deadlock-mods/ui/components/context-menu";
import { Undo2, Wrench } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import {
  useActiveProfileFolder,
  useFixMods,
  useGameRunning,
  useModHealthReport,
  useRestoreOriginalFiles,
} from "@/hooks/use-mod-health";
import { healthAction, healthBadgeKind } from "@/lib/mods/mod-health";
import type { LocalMod } from "@/types/mods";

/** Lives inside the menu content, so it only subscribes while the menu is open. */
export const ModHealthMenuItems = ({ mod }: { mod: LocalMod }) => {
  const { t } = useTranslation();
  const profileFolder = useActiveProfileFolder();
  const report = useModHealthReport(profileFolder);
  const gameRunning = useGameRunning();
  const fix = useFixMods();
  const restoreOriginal = useRestoreOriginalFiles();
  const kind = healthBadgeKind(
    report.data?.mods.find((health) => health.modId === mod.remoteId),
  );
  const action = kind ? healthAction(kind) : null;
  if (!action) return null;

  return (
    <>
      <ContextMenuSeparator />
      {action === "fix" ? (
        <ContextMenuItem
          disabled={gameRunning || fix.isPending}
          onClick={() => fix.mutate({ profileFolder, modIds: [mod.remoteId] })}>
          <Wrench className='mr-2 h-4 w-4' />
          {t("modHealth.fixForPatch")}
        </ContextMenuItem>
      ) : (
        <ContextMenuItem
          disabled={gameRunning || restoreOriginal.isPending}
          onClick={() =>
            restoreOriginal.mutate({
              profileFolder,
              modId: mod.remoteId,
              modName: mod.name,
            })
          }>
          <Undo2 className='mr-2 h-4 w-4' />
          {t("modHealth.useOriginalFiles")}
        </ContextMenuItem>
      )}
    </>
  );
};
