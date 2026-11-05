import type { checkModUpdates } from "@/lib/api-client";
import { type LocalMod, ModStatus } from "@/types/mods";

type ModUpdate = Awaited<ReturnType<typeof checkModUpdates>>["updates"][number];

export const canCheckModUpdates = (mod: LocalMod) =>
  (mod.status === ModStatus.Installed || mod.status === ModStatus.Downloaded) &&
  !!mod.remoteId &&
  !mod.remoteId.startsWith("local-") &&
  !mod.remoteUrl.startsWith("local://");

export const isModUpdateSkipped = (
  update: ModUpdate,
  localMod: LocalMod | undefined,
) => {
  if (update.mod.source) {
    return (
      localMod?.skippedSourceRevision ===
      JSON.stringify([
        update.mod.source.releaseId,
        update.mod.source.contentRevision,
      ])
    );
  }
  return (
    localMod?.skippedUpdateAt !== undefined &&
    update.updatedAt <= localMod.skippedUpdateAt
  );
};

export const availableModUpdates = (
  updates: ModUpdate[],
  localMods: LocalMod[],
) =>
  updates.filter((update) => {
    const localMod = localMods.find(
      (mod) => mod.remoteId === update.mod.remoteId,
    );
    return (
      localMod &&
      canCheckModUpdates(localMod) &&
      !isModUpdateSkipped(update, localMod)
    );
  });
