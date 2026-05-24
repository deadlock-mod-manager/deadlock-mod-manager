import { type LocalMod, ModStatus } from "@/types/mods";

type InstalledFileState = Pick<
  LocalMod,
  "status" | "installedVpks" | "installedConfigFiles"
>;

type InstalledVpkState = Pick<LocalMod, "status" | "installedVpks">;

export function isInstalledModWithFiles(mod: InstalledFileState): boolean {
  return (
    mod.status === ModStatus.Installed &&
    ((mod.installedVpks?.length ?? 0) > 0 ||
      (mod.installedConfigFiles?.length ?? 0) > 0)
  );
}

export function isInstalledModWithVpks(mod: InstalledVpkState): boolean {
  return (
    mod.status === ModStatus.Installed &&
    !!mod.installedVpks &&
    mod.installedVpks.length > 0
  );
}
