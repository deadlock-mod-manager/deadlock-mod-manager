import { z } from "zod";
import { getErrorMessage } from "@/lib/errors";
import { isTauriError } from "@/types/tauri";

interface ModReference {
  remoteId: string;
  name: string;
}

interface ProfileReference {
  folderName: string | null;
  name: string;
  mods: ModReference[];
}

const duplicateOwnershipSchema = z.object({
  kind: z.literal("duplicateVpkOwnership"),
  conflictingMods: z.array(z.string()).min(2),
  path: z.string(),
  profileFolder: z.string(),
});

export interface BatchUpdateFailure {
  kind?: string;
  message: string;
  ownership?: {
    mods: { id: string; name: string }[];
    path: string;
    profileName: string;
  };
}

export function getBatchUpdateFailure<T>(
  error: T,
  library: ModReference[],
  profiles: ProfileReference[],
): BatchUpdateFailure {
  const parsed = duplicateOwnershipSchema.safeParse(error);
  const failure: BatchUpdateFailure = {
    kind: isTauriError(error) ? error.kind : undefined,
    message: getErrorMessage(error),
  };
  if (!parsed.success) return failure;

  const { conflictingMods, path, profileFolder } = parsed.data;
  const profile = profiles.find(
    (item) => (item.folderName ?? "") === profileFolder,
  );
  failure.ownership = {
    path,
    profileName: profile?.name ?? profileFolder,
    mods: conflictingMods.map((id) => ({
      id,
      name:
        profile?.mods.find((mod) => mod.remoteId === id)?.name ??
        library.find((mod) => mod.remoteId === id)?.name ??
        id,
    })),
  };
  return failure;
}

export function resolveUpdateFailures(
  failures: [string, string][],
  mods: ModReference[],
) {
  return failures.map(([id, reason]) => ({
    id,
    name: mods.find((mod) => mod.remoteId === id)?.name ?? id,
    reason,
  }));
}

export function remainingUpdateTargets<T extends { mod: ModReference }>(
  mods: T[],
  result?: { failed: [string, string][] },
): T[] {
  if (!result) return mods;
  const failedIds = new Set(result.failed.map(([id]) => id));
  return mods.filter((item) => failedIds.has(item.mod.remoteId));
}
