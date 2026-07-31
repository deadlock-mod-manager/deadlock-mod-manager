const basename = (value: string) => value.split(/[\\/]/).pop() || value;

/**
 * VPK files in a profile that no installed mod accounts for.
 *
 * `vpkFiles` are shard locators — a file outside the base folder arrives as
 * `addons2/pak01_dir.vpk` — while a mod records the bare filename it owns
 * inside its own shard. Matching therefore happens on basenames: comparing
 * locators directly would report every overflow-shard file as unowned and
 * offer a legitimately enabled mod for deletion.
 */
export const findUnmatchedVpks = (
  vpkFiles: string[],
  localMods: { remoteId: string; installedVpks?: string[] | null }[],
): string[] => {
  const owned = new Set<string>();

  for (const mod of localMods) {
    for (const installedVpk of mod.installedVpks ?? []) {
      owned.add(basename(installedVpk));
    }
    for (const vpk of vpkFiles) {
      const name = basename(vpk);
      if (name.startsWith(`${mod.remoteId}_`)) {
        owned.add(name);
      }
    }
  }

  return vpkFiles.filter((vpk) => !owned.has(basename(vpk)));
};
