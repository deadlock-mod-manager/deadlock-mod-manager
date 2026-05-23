import { ModStatus, type RepairReason } from "@/types/mods";
import type { VpkManifestEntry } from "@/types/profiles";

export const vpkFilename = (vpk: string) => vpk.split(/[\\/]/).pop() || vpk;

export const hasEveryEnabledVpk = (
  vpks: string[] | undefined,
  enabledVpkSet: Set<string>,
) => {
  const currentVpks = vpks ?? [];
  return (
    currentVpks.length > 0 &&
    currentVpks.every((vpk) => enabledVpkSet.has(vpkFilename(vpk)))
  );
};

export const manifestWantsEnabled = (entry: VpkManifestEntry) =>
  entry.desiredState ? entry.desiredState === "enabled" : entry.enabled;

export const manifestRepairReason = (
  entry: VpkManifestEntry,
  fallback: RepairReason,
) => (entry.repairReason ?? fallback) as RepairReason;

type ProjectManifestEntryOptions = {
  enabledVpkSet: Set<string>;
  allVpkSet: Set<string>;
  fallbackRepairReason?: RepairReason;
  fallbackInstallOrder?: number;
};

export type ManifestEntryProjection = {
  wantsEnabled: boolean;
  hasEnabledVpks: boolean;
  hasDisabledVpks: boolean;
  status: ModStatus.Installed | ModStatus.Downloaded | ModStatus.NeedsRepair;
  repairReason?: RepairReason;
  installedVpks: string[];
  installOrder?: number;
};

export const projectManifestEntryToModState = (
  entry: VpkManifestEntry,
  {
    enabledVpkSet,
    allVpkSet,
    fallbackRepairReason,
    fallbackInstallOrder,
  }: ProjectManifestEntryOptions,
): ManifestEntryProjection => {
  const currentVpks = entry.currentVpks ?? [];
  const disabledVpks = entry.disabledVpks ?? [];
  const wantsEnabled = manifestWantsEnabled(entry);
  const hasEnabledVpks = entry.diskState
    ? wantsEnabled && entry.diskState === "active"
    : wantsEnabled && hasEveryEnabledVpk(currentVpks, enabledVpkSet);
  const hasDisabledVpks =
    !wantsEnabled &&
    (entry.diskState
      ? entry.diskState === "disabled"
      : disabledVpks.some((vpk) => allVpkSet.has(vpk)));
  const installOrder = entry.order ?? fallbackInstallOrder;

  if (hasEnabledVpks) {
    return {
      wantsEnabled,
      hasEnabledVpks,
      hasDisabledVpks,
      status: ModStatus.Installed,
      repairReason: undefined,
      installedVpks: currentVpks,
      installOrder,
    };
  }

  if (wantsEnabled) {
    return {
      wantsEnabled,
      hasEnabledVpks,
      hasDisabledVpks,
      status: ModStatus.NeedsRepair,
      repairReason: manifestRepairReason(
        entry,
        fallbackRepairReason ?? "missingEnabledVpks",
      ),
      installedVpks: [],
      installOrder,
    };
  }

  if (hasDisabledVpks) {
    return {
      wantsEnabled,
      hasEnabledVpks,
      hasDisabledVpks,
      status: ModStatus.Downloaded,
      repairReason: undefined,
      installedVpks: [],
      installOrder,
    };
  }

  return {
    wantsEnabled,
    hasEnabledVpks,
    hasDisabledVpks,
    status: ModStatus.NeedsRepair,
    repairReason: manifestRepairReason(
      entry,
      fallbackRepairReason ?? "missingPayload",
    ),
    installedVpks: [],
    installOrder,
  };
};
