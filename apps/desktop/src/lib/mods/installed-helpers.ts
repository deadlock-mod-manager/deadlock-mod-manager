import { type LocalMod, ModStatus, type RepairReason } from "@/types/mods";

const manualRepairReasons = new Set<RepairReason>([
  "needsDownloadChoice",
  "needsFileSelection",
]);

export function isInstalledModWithVpks(mod: LocalMod): boolean {
  return (
    mod.status === ModStatus.Installed &&
    !!mod.installedVpks &&
    mod.installedVpks.length > 0
  );
}

export function isRepairableMod(mod: LocalMod): boolean {
  return mod.status === ModStatus.NeedsRepair;
}

export function isManualRepairMod(mod: LocalMod): boolean {
  return (
    isRepairableMod(mod) &&
    !!mod.repairReason &&
    manualRepairReasons.has(mod.repairReason)
  );
}

export function isAutomaticRepairMod(mod: LocalMod): boolean {
  return isRepairableMod(mod) && !isManualRepairMod(mod);
}

export function getModStatusSortRank(mod: LocalMod): number {
  if (isInstalledModWithVpks(mod)) {
    return 0;
  }

  if (isRepairableMod(mod)) {
    return 1;
  }

  return 2;
}
