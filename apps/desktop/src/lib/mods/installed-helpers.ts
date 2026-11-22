import { type LocalMod, ModStatus } from "@/types/mods";
import { isNativeSourceMod } from "@/lib/mod-sources";
import { parseSubmissionSlug } from "./submission-ref";

export function isInstalledModWithVpks(
  mod: Pick<LocalMod, "status" | "installedVpks">,
): boolean {
  return (
    mod.status === ModStatus.Installed &&
    !!mod.installedVpks &&
    mod.installedVpks.length > 0
  );
}

/** Local mods only exist on disk, so they can never be downloaded again. */
export function isLocalMod(mod: Pick<LocalMod, "remoteId">): boolean {
  return parseSubmissionSlug(mod.remoteId)?.provider === "local";
}

/** Unlike isLocalMod, also false for Foundry exports and files found on disk,
 *  whose ids aren't submission slugs. */
export function canDownloadAgain(mod: Pick<LocalMod, "remoteId">): boolean {
  return (
    parseSubmissionSlug(mod.remoteId)?.provider === "gamebanana" ||
    isNativeSourceMod(mod.remoteId)
  );
}
