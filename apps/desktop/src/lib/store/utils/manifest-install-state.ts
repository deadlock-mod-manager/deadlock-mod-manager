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
    modAuthorId: null,
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

export const ENABLED_VPK_PATTERN = /^pak\d+_dir\.vpk$/i;

export const enabledVpkLocators = (
  files: readonly ProfileVpkFile[],
): ReadonlySet<string> =>
  new Set(
    files
      .filter((file) => ENABLED_VPK_PATTERN.test(file.filename))
      .map((file) => `${file.shard}:${file.filename}`),
  );

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

const ACTIVE_OPERATION_STATUSES: ReadonlySet<ModStatus> = new Set([
  ModStatus.Extracting,
  ModStatus.Installing,
  ModStatus.Removing,
]);

export const sameVpkList = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((filename, index) => filename === right[index]);

export const needsInstallStateRepair = (
  mod: LocalMod,
  installedVpks: readonly string[],
  missingVpks: readonly string[] = [],
): boolean => {
  if (ACTIVE_OPERATION_STATUSES.has(mod.status)) {
    return false;
  }
  if (!sameVpkList(mod.missingVpks ?? [], missingVpks)) {
    return true;
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

const SETTLED_STATUSES: ReadonlySet<ModStatus> = new Set([
  ModStatus.Downloaded,
  ModStatus.Installed,
]);

export const canForgetMod = (mod: LocalMod): boolean =>
  SETTLED_STATUSES.has(mod.status);
