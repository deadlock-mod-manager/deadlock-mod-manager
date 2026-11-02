import { getErrorMessage } from "@/lib/errors";
import type { LocalMod } from "@/types/mods";
import type { ModProfile } from "@/types/profiles";
import { isTauriError } from "@/types/tauri";

export type ModRecoveryReport = {
  removed: number;
  failures: { remoteId: string; name: string; message: string }[];
};

type ClearProfileModsOptions = {
  profile: ModProfile;
  mods: LocalMod[];
  discardDownload: (remoteId: string) => Promise<void>;
  purgeMod: (args: {
    modId: string;
    vpks: string[];
    profileFolder: string | null;
  }) => Promise<void>;
  removeMod: (remoteId: string, profileId: ModProfile["id"]) => void;
  bumpProfileSyncRevision: (profileId: ModProfile["id"]) => number;
};

export const clearProfileMods = async ({
  profile,
  mods,
  discardDownload,
  purgeMod,
  removeMod,
  bumpProfileSyncRevision,
}: ClearProfileModsOptions): Promise<ModRecoveryReport> => {
  const report: ModRecoveryReport = { removed: 0, failures: [] };
  bumpProfileSyncRevision(profile.id);
  try {
    for (const [index, mod] of mods.entries()) {
      try {
        await discardDownload(mod.remoteId);
        await purgeMod({
          modId: mod.remoteId,
          vpks: mod.installedVpks ?? [],
          profileFolder: profile.folderName,
        });
        removeMod(mod.remoteId, profile.id);
        report.removed += 1;
      } catch (error) {
        const message = getErrorMessage(error);
        if (isTauriError(error) && error.kind === "gameRunning") {
          report.failures.push(
            ...mods
              .slice(index)
              .map(({ remoteId, name }) => ({ remoteId, name, message })),
          );
          break;
        }
        report.failures.push({
          remoteId: mod.remoteId,
          name: mod.name,
          message,
        });
      }
    }
  } finally {
    bumpProfileSyncRevision(profile.id);
  }
  return report;
};
