type RemoteIdentified = { remoteId: string };

const indexes = new WeakMap<readonly RemoteIdentified[], Map<string, number>>();

/**
 * `localMods.find` by remote id, through an index built once per array.
 * Store selectors run on every state change (download progress included) in
 * every mounted card, so a linear scan per selector adds up across the store.
 * Matches `find` semantics: the first entry wins for a duplicated id.
 */
export const findLocalMod = <T extends RemoteIdentified>(
  localMods: readonly T[],
  remoteId: string | undefined,
): T | undefined => {
  if (!remoteId) return undefined;
  let index = indexes.get(localMods);
  if (!index) {
    index = new Map();
    for (const [position, mod] of localMods.entries()) {
      if (!index.has(mod.remoteId)) index.set(mod.remoteId, position);
    }
    indexes.set(localMods, index);
  }
  const position = index.get(remoteId);
  return position === undefined ? undefined : localMods[position];
};
