import type { HeroModGroup } from "@/lib/mods/hero-mods";
import {
  applyDownloadTimeSelection,
  requiresFileSelection,
} from "@/lib/mods/mod-variants";
import type { LocalMod } from "@/types/mods";

export const RANDOMIZER_MIN_POOL = 2;

export type SkinRandomizerSelection = {
  skins: Readonly<Record<string, true>>;
  defaultHeroes: Readonly<Record<string, true>>;
};

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

export const canRandomizeMod = (mod: RandomizableMod): boolean => {
  if (mod.usesCriticalPaths) {
    return false;
  }
  return (
    !mod.installedFileTree ||
    !requiresFileSelection(mod.installedFileTree) ||
    (mod.installedVpks?.length ?? 0) > 0 ||
    applyDownloadTimeSelection(mod, mod.installedFileTree) !== null
  );
};

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
