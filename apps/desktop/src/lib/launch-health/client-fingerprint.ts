import { type LocalMod, ModStatus } from "@/types/mods";
import type { ModProfile } from "@/types/profiles";
import type { ClientFingerprint } from "./types";

/** Persisted dates come back from storage as strings. */
type StoredDate = Date | string;

type FingerprintMod = Pick<
  LocalMod,
  "remoteId" | "name" | "status" | "activeVariantArchive"
> & { downloadedAt?: StoredDate };

type FingerprintProfile = Pick<ModProfile, "id" | "name"> & {
  enabledMods: Record<string, { lastModified: StoredDate }>;
};

const toIsoString = (value: StoredDate | undefined): string | null => {
  if (value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** The active profile and the mods it had enabled and installed. */
export const buildClientFingerprint = (
  profile: FingerprintProfile | undefined,
  localMods: FingerprintMod[],
  isEnabled: (remoteId: string) => boolean,
): ClientFingerprint | null => {
  if (!profile) return null;
  return {
    profileId: profile.id,
    profileName: profile.name,
    mods: localMods
      .filter(
        (mod) => mod.status === ModStatus.Installed && isEnabled(mod.remoteId),
      )
      .map((mod) => ({
        remoteId: mod.remoteId,
        name: mod.name,
        downloadedAt: toIsoString(mod.downloadedAt),
        variant: mod.activeVariantArchive ?? null,
        enabledAt: toIsoString(profile.enabledMods[mod.remoteId]?.lastModified),
      })),
  };
};
