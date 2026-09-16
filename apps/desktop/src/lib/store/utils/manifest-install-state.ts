import { type LocalMod, ModStatus } from "@/types/mods";
import type { ProfileVpkFile, VpkManifestEntry } from "@/types/profiles";

export const placeholderModFromManifest = (
  modId: string,
  entry: VpkManifestEntry,
  installedVpks: string[],
): LocalMod => {
  const now = new Date();
  const isEnabled = installedVpks.length > 0;
  return {
    id: modId,
    remoteId: modId,
    name: modId,
    description: null,
    remoteUrl: "",
    category: "local",
    likes: 0,
    author: "",
    downloadable: false,
    remoteAddedAt: now,
    remoteUpdatedAt: now,
    tags: [],
    images: [],
    hero: null,
    isAudio: false,
    isMap: false,
    audioUrl: null,
    downloadCount: 0,
    isNSFW: false,
    isObsolete: false,
    isBlacklisted: false,
    blacklistReason: null,
    blacklistedAt: null,
    blacklistedBy: null,
    filesUpdatedAt: null,
    metadata: null,
    dependencies: null,
    overrides: null,
    createdAt: now,
    updatedAt: now,
    status: isEnabled ? ModStatus.Installed : ModStatus.Downloaded,
    installedVpks,
    metadataPending: true,
    installOrder: entry.order ?? undefined,
    downloadedAt: now,
  };
};

/** A VPK whose filename marks it as active in its shard, rather than parked. */
export const ENABLED_VPK_PATTERN = /^pak\d+_dir\.vpk$/i;

export const enabledVpkLocators = (
  files: readonly ProfileVpkFile[],
): ReadonlySet<string> =>
  new Set(
    files
      .filter((file) => ENABLED_VPK_PATTERN.test(file.filename))
      .map((file) => `${file.shard}:${file.filename}`),
  );

/**
 * The single reading of what the manifest says a mod has installed: its claimed
 * VPKs, but only while every one of them is actually active on disk in the shard
 * the entry recorded. Anything else counts as not installed.
 */
export const installedVpksFromManifest = (
  entry: VpkManifestEntry,
  locators: ReadonlySet<string>,
): string[] => {
  const claimedVpks = entry.currentVpks ?? [];
  return entry.enabled &&
    claimedVpks.length > 0 &&
    claimedVpks.every((filename) => locators.has(`${entry.shard}:${filename}`))
    ? claimedVpks
    : [];
};

/** Statuses owned by an operation running right now, which must not be undone. */
const ACTIVE_OPERATION_STATUSES: ReadonlySet<ModStatus> = new Set([
  ModStatus.Extracting,
  ModStatus.Installing,
  ModStatus.Removing,
]);

const sameVpkList = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((filename, index) => filename === right[index]);

/**
 * The manifest owns what is installed; a tracked mod only mirrors it. A mirror
 * that disagrees is stale - typically a store carried over from a build that
 * wrote install state itself, which then shows installed mods as unfinished
 * downloads with no VPKs attached.
 */
export const needsInstallStateRepair = (
  mod: LocalMod,
  installedVpks: readonly string[],
): boolean => {
  if (ACTIVE_OPERATION_STATUSES.has(mod.status)) {
    return false;
  }
  if (installedVpks.length > 0) {
    return (
      mod.status !== ModStatus.Installed ||
      !sameVpkList(mod.installedVpks ?? [], installedVpks)
    );
  }
  return (
    mod.status === ModStatus.Installed || (mod.installedVpks?.length ?? 0) > 0
  );
};
