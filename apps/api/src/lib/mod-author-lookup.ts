const GAMEBANANA_AUTHOR_PREFIX = "gamebanana:";

export type ModAuthorLookup =
  | { kind: "id"; id: string }
  | { kind: "provider"; provider: "gamebanana"; remoteId: string };

export const parseModAuthorLookup = (
  lookupId: string,
): ModAuthorLookup | null => {
  if (!lookupId.startsWith(GAMEBANANA_AUTHOR_PREFIX)) {
    return { kind: "id", id: lookupId };
  }

  const remoteId = lookupId.slice(GAMEBANANA_AUTHOR_PREFIX.length);
  return /^[1-9]\d*$/.test(remoteId)
    ? { kind: "provider", provider: "gamebanana", remoteId }
    : null;
};
