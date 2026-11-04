import type { ModDependency } from "@/types/dependencies";
import { type LocalMod, ModStatus } from "@/types/mods";

type RequirementMod = Pick<
  LocalMod,
  "remoteId" | "status" | "installedVpks" | "missingVpks"
>;
export type RequirementState =
  | "met"
  | "missing"
  | "disabled"
  | "shouldBeOff"
  | "unverified";

export function requirementState(
  dependency: ModDependency,
  mods: readonly RequirementMod[],
): RequirementState {
  if (!dependency.remoteId) return "unverified";
  const installed = mods.find((mod) => mod.remoteId === dependency.remoteId);
  if (dependency.mustBeDisabled) {
    return installed?.status === ModStatus.Installed &&
      installed.installedVpks?.length
      ? "shouldBeOff"
      : "met";
  }
  if (
    !installed ||
    installed.status === ModStatus.FailedToDownload ||
    installed.status === ModStatus.Downloading ||
    installed.status === ModStatus.Extracting ||
    installed.status === ModStatus.Paused ||
    installed.status === ModStatus.Removed
  )
    return "missing";
  if (
    installed.status === ModStatus.Installed &&
    installed.installedVpks?.length &&
    !installed.missingVpks?.length
  )
    return "met";
  return "disabled";
}

export function unmetRequirements(
  dependencies: readonly ModDependency[],
  mods: readonly RequirementMod[],
) {
  return dependencies.filter((dependency) => {
    if (dependency.level === "recommended") return false;
    const state = requirementState(dependency, mods);
    return (
      state === "missing" || state === "disabled" || state === "shouldBeOff"
    );
  });
}
