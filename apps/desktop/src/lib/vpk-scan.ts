import type { ProfileVpkFile, VpkManifest } from "@/types/profiles";
import {
  extractSubmissionSlugFromFilename,
  parseSubmissionSlug,
  serializeSubmissionRef,
} from "./mods/submission-ref";

const BASE_SHARD = 1;

const basename = (value: string) => value.split(/[\\/]/).pop() || value;
const locatorKey = (shard: number, filename: string) => `${shard}:${filename}`;

/**
 * Locators of VPK files in a profile that no installed mod accounts for.
 *
 * Every shard folder numbers its files from `pak01_dir.vpk`, so the same name
 * can belong to one mod in `addons` and another in `addons2`. Ownership is
 * therefore matched on (shard, filename) through the manifest. Disabled copies
 * always sit in the base folder, and a mod the manifest does not know yet falls
 * back to the bare names it recorded there.
 */
export const findUnmatchedVpks = (
  files: readonly ProfileVpkFile[],
  manifest: VpkManifest,
  localMods: { remoteId: string; installedVpks?: string[] | null }[],
): string[] => {
  const owned = new Set<string>();
  const installedSubmissionSlugs = new Set<string>();

  for (const mod of localMods) {
    const submission = parseSubmissionSlug(mod.remoteId);
    const slug = submission && serializeSubmissionRef(submission);
    if (slug) {
      installedSubmissionSlugs.add(slug);
    }
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

  return files
    .filter((file) => {
      if (owned.has(locatorKey(file.shard, file.filename))) return false;
      const slug = extractSubmissionSlugFromFilename(file.filename);
      return !(slug && installedSubmissionSlugs.has(slug));
    })
    .map((file) => file.locator);
};
