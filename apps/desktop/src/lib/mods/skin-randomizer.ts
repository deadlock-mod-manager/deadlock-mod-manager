import type { HeroModGroup } from "@/lib/mods/hero-mods";
import {
  applyDownloadTimeSelection,
  requiresFileSelection,
} from "@/lib/mods/mod-variants";
import type { LocalMod } from "@/types/mods";

/** Below this there is nothing to choose between, so the hero is left alone. */
export const RANDOMIZER_MIN_POOL = 2;

export type SkinRandomizerSelection = {
  /** Skins picked for their hero's pool, by remoteId. */
  skins: Readonly<Record<string, true>>;
  /** Heroes whose default look is one of the outcomes. */
  defaultHeroes: Readonly<Record<string, true>>;
};

/** A pool entry: a skin, or null for the hero's default look. */
export type RandomizerOutcome<T> = T | null;

type RandomizableMod = Pick<
  LocalMod,
  | "usesCriticalPaths"
  | "installedFileTree"
  | "installedVpks"
  | "downloads"
  | "selectedDownloads"
  | "activeVariantArchive"
>;

/**
 * Whether a mod can be put on at launch without asking anything. A mod that
 * still needs its variant picked, or that writes to critical paths, needs a
 * dialog, and nobody is looking at the app while the game starts.
 */
export const canRandomizeMod = (mod: RandomizableMod): boolean => {
  if (mod.usesCriticalPaths) {
    return false;
  }
  // Without a stored tree the launch looks at the files itself and skips the
  // mod if it turns out to need a pick. With one, these are the choices the
  // installer reuses without asking.
  return (
    !mod.installedFileTree ||
    !requiresFileSelection(mod.installedFileTree) ||
    (mod.installedVpks?.length ?? 0) > 0 ||
    applyDownloadTimeSelection(mod, mod.installedFileTree) !== null
  );
};

/** Everything a hero can end up wearing on the next launch. */
export function randomizerPool<
  T extends RandomizableMod & { remoteId: string },
>(
  hero: string,
  group: HeroModGroup<T>,
  selection: SkinRandomizerSelection,
): RandomizerOutcome<T>[] {
  const skins = group.skins.filter(
    (skin) => selection.skins[skin.remoteId] && canRandomizeMod(skin),
  );
  return selection.defaultHeroes[hero] ? [null, ...skins] : skins;
}

export const isRandomizedPool = (pool: readonly unknown[]): boolean =>
  pool.length >= RANDOMIZER_MIN_POOL;

/**
 * What is on right now, as a pool outcome: the one installed mod, or null for
 * nothing (a hero's default look). Undefined when several are installed, since
 * that matches no single outcome.
 */
export function currentOutcome<T extends { remoteId: string }>(
  active: readonly T[],
): RandomizerOutcome<T> | undefined {
  if (active.length > 1) {
    return undefined;
  }
  return active[0] ?? null;
}

const sameOutcome = <T extends { remoteId: string }>(
  a: RandomizerOutcome<T>,
  b: RandomizerOutcome<T>,
) => (a === null || b === null ? a === b : a.remoteId === b.remoteId);

/**
 * Rolls one outcome from the pool. What the hero wore last time is left out,
 * so no two launches in a row land on the same look.
 */
export function pickRandomOutcome<T extends { remoteId: string }>(
  pool: readonly RandomizerOutcome<T>[],
  previous?: RandomizerOutcome<T>,
  random: () => number = Math.random,
): RandomizerOutcome<T> {
  const fresh =
    previous === undefined
      ? pool
      : pool.filter((outcome) => !sameOutcome(outcome, previous));
  const candidates = fresh.length > 0 ? fresh : pool;
  const index = Math.min(
    Math.floor(random() * candidates.length),
    candidates.length - 1,
  );
  return candidates[index] ?? null;
}

/**
 * The skins "select everything" should tick: every randomizable skin of every
 * hero that ends up with something to choose between. A hero with one skin only
 * qualifies once its default look is in the pool as well.
 */
export function bulkSelectableSkins<
  T extends RandomizableMod & { remoteId: string },
>(
  groups: ReadonlyMap<string, HeroModGroup<T>>,
  defaultHeroes: SkinRandomizerSelection["defaultHeroes"],
): string[] {
  const ids: string[] = [];
  for (const [hero, group] of groups) {
    const skins = group.skins.filter(canRandomizeMod);
    if (skins.length + (defaultHeroes[hero] ? 1 : 0) >= RANDOMIZER_MIN_POOL) {
      ids.push(...skins.map((skin) => skin.remoteId));
    }
  }
  return ids;
}
