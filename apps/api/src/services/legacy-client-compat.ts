/**
 * Compatibility for desktop releases that predate GameBanana submission
 * identities: they address mods by internal catalog ID (`mod_…`) and require
 * `matchedVpk.mod` in VPK analysis responses. Delete this module and its call
 * sites with the catalog retirement (#715), once those releases are past the
 * cutoff.
 */
import {
  type CachedVPK,
  db,
  type Mod,
  ModRepository,
} from "@deadlock-mods/database";
import {
  type GameBananaIdentity,
  gameBananaIdentitySlug,
  parseGameBananaSlug,
} from "@/services/gamebanana-submission";

export type LegacyModLookup = Pick<
  ModRepository,
  "findById" | "findBySubmissionIdentity"
>;

const modRepository = new ModRepository(db);

export const legacyModIdentity = (
  mod: Pick<Mod, "remoteId" | "isAudio">,
): GameBananaIdentity | null =>
  parseGameBananaSlug(
    mod.isAudio && !mod.remoteId.startsWith("snd-")
      ? `snd-${mod.remoteId}`
      : mod.remoteId,
  );

export const resolveLegacyModId = async (
  modId: string,
  lookup: LegacyModLookup = modRepository,
): Promise<GameBananaIdentity | null> => {
  if (!modId.startsWith("mod_")) return null;
  const mod = await lookup.findById(modId);
  return mod ? legacyModIdentity(mod) : null;
};

/** The fields legacy desktop deserializes from `matchedVpk.mod`. */
export interface LegacyVpkMod {
  id: string;
  remoteId: string;
  name: string;
  author: string;
}

type LegacyCompatibleVpk = CachedVPK & { mod: LegacyVpkMod | null };

// Alternative matches are often re-uploads of the same mod, so each mod is
// looked up once per response.
const memoizeLookup = (lookup: LegacyModLookup): LegacyModLookup => {
  const loaded = new Map<string, Promise<Mod | null>>();
  const once = (key: string, load: () => Promise<Mod | null>) => {
    const pending = loaded.get(key) ?? load();
    loaded.set(key, pending);
    return pending;
  };
  return {
    findById: (id) => once(`id:${id}`, () => lookup.findById(id)),
    findBySubmissionIdentity: (submissionType, submissionId) =>
      once(`${submissionType}:${submissionId}`, () =>
        lookup.findBySubmissionIdentity(submissionType, submissionId),
      ),
  };
};

const legacyVpkMod = async (
  entry: CachedVPK,
  lookup: LegacyModLookup,
): Promise<LegacyVpkMod | null> => {
  let mod: Mod | null = null;
  if (entry.modId) {
    mod = await lookup.findById(entry.modId);
  } else if (entry.submissionType && entry.submissionId) {
    mod = await lookup.findBySubmissionIdentity(
      entry.submissionType,
      entry.submissionId,
    );
  }
  if (mod) {
    return {
      id: mod.id,
      remoteId: mod.remoteId,
      name: mod.name,
      author: mod.author,
    };
  }
  if (!entry.submissionType || !entry.submissionId) return null;
  // Not in the catalog (e.g. ingested after the catalog stopped syncing). The
  // slug is what legacy clients use to look the mod up, so it is enough.
  const slug = gameBananaIdentitySlug({
    provider: "gamebanana",
    submissionType: entry.submissionType,
    submissionId: entry.submissionId,
  });
  return { id: slug, remoteId: slug, name: slug, author: "" };
};

const withLegacyMod = async (
  entry: CachedVPK,
  lookup: LegacyModLookup,
): Promise<CachedVPK> => {
  const compatible: LegacyCompatibleVpk = {
    ...entry,
    mod: await legacyVpkMod(entry, lookup),
  };
  return compatible;
};

interface VpkAnalysisShape {
  matchedVpk?: CachedVPK;
  match?: { alternativeMatches?: CachedVPK[] };
}

/**
 * Re-attaches the `mod` relation VPK analysis responses carried before v2.
 * The return type deliberately omits it so current code cannot depend on it.
 */
export const withLegacyVpkMods = async <T extends VpkAnalysisShape>(
  result: T,
  lookup: LegacyModLookup = modRepository,
): Promise<T> => {
  const memoized = memoizeLookup(lookup);
  const alternatives = result.match?.alternativeMatches;
  return {
    ...result,
    matchedVpk:
      result.matchedVpk && (await withLegacyMod(result.matchedVpk, memoized)),
    match: result.match && {
      ...result.match,
      alternativeMatches:
        alternatives &&
        (await Promise.all(
          alternatives.map((entry) => withLegacyMod(entry, memoized)),
        )),
    },
  };
};
