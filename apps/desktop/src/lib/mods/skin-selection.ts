import { ModCategory } from "@/lib/constants";
import { resolveLocalModHero } from "@/lib/mods/hero-resolution";
import { type LocalMod, ModStatus } from "@/types/mods";

export type SkinSelectableMod = Pick<
  LocalMod,
  | "remoteId"
  | "name"
  | "hero"
  | "category"
  | "status"
  | "detectedHero"
  | "heroOverride"
>;

const SKIN_CATEGORIES: ReadonlySet<string> = new Set([
  ModCategory.SKINS,
  ModCategory.MODEL_REPLACEMENT,
]);

const SELECTABLE_STATUSES: ReadonlySet<ModStatus> = new Set([
  ModStatus.Downloaded,
  ModStatus.Installed,
  ModStatus.FailedToInstall,
]);

export type HeroSkinGroup<T> = {
  skins: T[];
  active: T[];
};

export function groupSkinsByHero<T extends SkinSelectableMod>(
  mods: T[],
): Map<string, HeroSkinGroup<T>> {
  const groups = new Map<string, HeroSkinGroup<T>>();

  for (const mod of mods) {
    if (
      !SKIN_CATEGORIES.has(mod.category) ||
      !SELECTABLE_STATUSES.has(mod.status)
    ) {
      continue;
    }

    const hero = resolveLocalModHero(mod).hero;
    if (!hero) {
      continue;
    }

    const group = groups.get(hero) ?? { skins: [], active: [] };
    group.skins.push(mod);
    if (mod.status === ModStatus.Installed) {
      group.active.push(mod);
    }
    groups.set(hero, group);
  }

  return groups;
}
