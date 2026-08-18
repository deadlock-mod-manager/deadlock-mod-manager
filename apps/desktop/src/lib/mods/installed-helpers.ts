import { type LocalMod, ModStatus } from "@/types/mods";

export function isInstalledModWithVpks(mod: LocalMod): boolean {
  return (
    mod.status === ModStatus.Installed &&
    !!mod.installedVpks &&
    mod.installedVpks.length > 0
  );
}

/** Local mods only exist on disk, so they can never be downloaded again. */
export function isLocalMod(mod: Pick<LocalMod, "remoteId">): boolean {
  return mod.remoteId.startsWith("local-");
}
