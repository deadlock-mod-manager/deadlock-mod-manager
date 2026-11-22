import type { ProfileVpkFile, VpkManifest } from "@/types/profiles";
import {
  extractSubmissionSlugFromFilename,
  parseSubmissionSlug,
  serializeSubmissionRef,
} from "./mods/submission-ref";

const BASE_SHARD = 1;

const basename = (value: string) => value.split(/[\\/]/).pop() || value;
const locatorKey = (shard: number, filename: string) => `${shard}:${filename}`;

type LibraryMod = { remoteId: string; installedVpks?: string[] | null };

const ownedVpkKeys = (
  manifest: VpkManifest,
  localMods: readonly LibraryMod[],
): Set<string> => {
  const owned = new Set<string>();
  for (const mod of localMods) {
    const entry = manifest.mods[mod.remoteId];
    if (entry) {
      for (const vpk of entry.currentVpks) {
        owned.add(locatorKey(entry.shard, vpk));
      }
      for (const vpk of entry.disabledVpks) {
        owned.add(locatorKey(BASE_SHARD, vpk));
      }
      continue;
    }
    for (const installedVpk of mod.installedVpks ?? []) {
      owned.add(locatorKey(BASE_SHARD, basename(installedVpk)));
    }
  }
  return owned;
};

export const isVpkOwned = (
  locator: string,
  manifest: VpkManifest,
  localMods: readonly LibraryMod[],
): boolean => {
  const [root, filename] = locator.includes("/")
    ? locator.split("/")
    : ["addons", locator];
  const shard = root === "addons" ? BASE_SHARD : Number(root.slice(6));
  return ownedVpkKeys(manifest, localMods).has(locatorKey(shard, filename));
};

export const findUnmatchedVpks = (
  files: readonly ProfileVpkFile[],
  manifest: VpkManifest,
  localMods: readonly LibraryMod[],
): string[] => {
  const owned = ownedVpkKeys(manifest, localMods);
  const installedSubmissionSlugs = new Set<string>();

  for (const mod of localMods) {
    if (/^source-[a-f0-9]{64}$/.test(mod.remoteId))
      installedSubmissionSlugs.add(mod.remoteId);
    const submission = parseSubmissionSlug(mod.remoteId);
    const slug = submission && serializeSubmissionRef(submission);
    if (slug) {
      installedSubmissionSlugs.add(slug);
    }
  }

  return files
    .filter((file) => {
      if (owned.has(locatorKey(file.shard, file.filename))) return false;
      const slug = extractSubmissionSlugFromFilename(file.filename);
      return !(slug && installedSubmissionSlugs.has(slug));
    })
    .map((file) => file.locator);
};
