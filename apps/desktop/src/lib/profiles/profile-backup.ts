import type {
  ProfileBackupPayload,
  ProfileBackupSummary,
} from "@deadlock-mods/shared";
import { isLocalMod } from "@/lib/mods/installed-helpers";
import { serializeEnabledProfileMods } from "@/lib/profiles/serialize-profile-mods";
import type { LocalMod } from "@/types/mods";
import type { ModProfile } from "@/types/profiles";

export interface CloudBackupLink {
  backupId: string;
  revision: number;
}

export type ProfileBackupStatus =
  | { kind: "none" }
  | { kind: "upToDate" | "changed"; backup: ProfileBackupSummary };

const byRemoteId = (left: { remoteId: string }, right: { remoteId: string }) =>
  left.remoteId.localeCompare(right.remoteId);

/**
 * Local mods only exist on this PC's disk, so they are counted but left out.
 * Lists are sorted so toggling a mod off and on again doesn't read as a change.
 */
export const buildProfileBackupPayload = (
  profile: Pick<ModProfile, "enabledMods" | "modGroups" | "description">,
  mods: LocalMod[],
): ProfileBackupPayload => {
  const serialized = serializeEnabledProfileMods(profile, mods);
  const backedUpMods = serialized.mods
    .filter((mod) => !isLocalMod(mod))
    .sort(byRemoteId);
  const backedUpIds = new Set(backedUpMods.map((mod) => mod.remoteId));
  const entries = Object.values(profile.enabledMods);

  return {
    version: "1",
    profile: {
      version: "3",
      payload: {
        mods: backedUpMods,
        loadOrder: serialized.loadOrder.filter((id) => backedUpIds.has(id)),
      },
    },
    disabledModCount: entries.filter(
      (entry) => !entry.enabled && !isLocalMod(entry),
    ).length,
    modGroups: (profile.modGroups ?? []).map(
      ({ id, name, modIds, collapsed }) => ({ id, name, modIds, collapsed }),
    ),
    description: profile.description || undefined,
    modNames: Object.fromEntries(
      mods
        .filter((mod) => backedUpIds.has(mod.remoteId))
        .map((mod) => [mod.remoteId, mod.name])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    skippedLocalModCount: entries.filter(isLocalMod).length,
  };
};

export const disabledModCountOf = (payload: ProfileBackupPayload) =>
  payload.disabledModCount ?? payload.disabledModIds?.length ?? 0;

export const profileBackupHashInput = (
  name: string,
  payload: ProfileBackupPayload,
) => JSON.stringify({ name, payload });

export const hashProfileBackup = async (hashInput: string): Promise<string> => {
  const bytes = new TextEncoder().encode(hashInput);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

/**
 * A link only counts while the account still has that backup, so signing in
 * with another account or deleting the backup elsewhere reads as "none".
 */
export const getProfileBackupStatus = (
  link: CloudBackupLink | undefined,
  backupsById: ReadonlyMap<string, ProfileBackupSummary>,
  currentHash: string | undefined,
): ProfileBackupStatus => {
  const backup = link ? backupsById.get(link.backupId) : undefined;
  if (!backup) return { kind: "none" };
  return {
    kind: backup.contentHash === currentHash ? "upToDate" : "changed",
    backup,
  };
};
