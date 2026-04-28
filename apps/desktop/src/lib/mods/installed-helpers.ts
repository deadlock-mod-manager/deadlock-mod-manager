import { type LocalMod, ModStatus } from "@/types/mods";

export function isInstalledModWithVpks(mod: LocalMod): boolean {
  return (
    mod.status === ModStatus.Installed &&
    !!mod.installedVpks &&
    mod.installedVpks.length > 0
  );
}
