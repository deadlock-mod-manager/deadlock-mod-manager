import { type LocalMod, ModStatus } from "@/types/mods";

export function isInstalledModWithFiles(mod: LocalMod): boolean {
  return (
    mod.status === ModStatus.Installed &&
    ((mod.installedVpks?.length ?? 0) > 0 ||
      (mod.installedConfigFiles?.length ?? 0) > 0)
  );
}

export function isInstalledModWithVpks(mod: LocalMod): boolean {
  return (
    mod.status === ModStatus.Installed &&
    !!mod.installedVpks &&
    mod.installedVpks.length > 0
  );
}
