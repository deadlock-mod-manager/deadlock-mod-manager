import { ModCategory } from "@/lib/constants";
import { resolveLocalModHero } from "@/lib/mods/hero-resolution";
import { type LocalMod, ModStatus } from "@/types/mods";

export type HeroSelectableMod = Pick<
  LocalMod,
  | "remoteId"
  | "name"
  | "hero"
  | "category"
  | "status"
  | "detectedHero"
  | "heroOverride"
>;

/**
 * A skin owns how a hero looks, so only one of them can be installed at a time.
 * Extras - weapon skins, ability and voice sounds - sit next to a skin instead
 * of replacing it, so they are switched on and off one by one.
 */
export type HeroModKind = "skin" | "extra";

const KIND_BY_CATEGORY = new Map<string, HeroModKind>([
  [ModCategory.SKINS, "skin"],
  [ModCategory.MODEL_REPLACEMENT, "skin"],
  [ModCategory.WEAPON_SOUNDS, "extra"],
  [ModCategory.ABILITY_SOUNDS, "extra"],
  [ModCategory.VOICE_LINES, "extra"],
  [ModCategory.KILL_SOUNDS, "extra"],
  [ModCategory.MUSIC, "extra"],
  [ModCategory.KILLSTREAK_MUSIC, "extra"],
  [ModCategory.OTHER_MISC, "extra"],
]);

const SELECTABLE_STATUSES: ReadonlySet<ModStatus> = new Set([
  ModStatus.Downloaded,
  ModStatus.Installed,
  ModStatus.FailedToInstall,
]);

export type HeroModGroup<T> = {
  skins: T[];
  extras: T[];
  /** Installed skins - more than one only once multiple skins are allowed. */
  activeSkins: T[];
  activeExtras: T[];
};

export type HeroModOptions = {
  /** Group weapon skins, sounds and the like under a hero as well. */
  includeExtras: boolean;
  /** Mods taken off a hero's list; still in the library, just not listed. */
  hidden: ReadonlySet<string>;
};

const emptyGroup = <T>(): HeroModGroup<T> => ({
  skins: [],
  extras: [],
  activeSkins: [],
  activeExtras: [],
});

/**
 * Where a mod belongs on the hero page, or null when it belongs nowhere: a
 * category that is not per-hero, a hero nothing resolved, a status it cannot be
 * selected in, or a mod the user took off the list. The hero behind an extra is
 * a guess far more often than the hero behind a skin, so extras only show up
 * once the setting asks for them - unless the hero was picked by hand.
 */
const placeHeroMod = (
  mod: HeroSelectableMod,
  { includeExtras, hidden }: HeroModOptions,
): { hero: string; kind: HeroModKind } | null => {
  const kind = KIND_BY_CATEGORY.get(mod.category);
  if (
    !kind ||
    !SELECTABLE_STATUSES.has(mod.status) ||
    hidden.has(mod.remoteId)
  ) {
    return null;
  }

  const { hero, hasOverride } = resolveLocalModHero(mod);
  if (!hero || (kind === "extra" && !includeExtras && !hasOverride)) {
    return null;
  }

  return { hero, kind };
};

export function groupModsByHero<T extends HeroSelectableMod>(
  mods: T[],
  options: HeroModOptions,
): Map<string, HeroModGroup<T>> {
  const groups = new Map<string, HeroModGroup<T>>();

  for (const mod of mods) {
    const placement = placeHeroMod(mod, options);
    if (!placement) {
      continue;
    }

    const group = groups.get(placement.hero) ?? emptyGroup<T>();
    if (placement.kind === "skin") {
      group.skins.push(mod);
      if (mod.status === ModStatus.Installed) {
        group.activeSkins.push(mod);
      }
    } else {
      group.extras.push(mod);
      if (mod.status === ModStatus.Installed) {
        group.activeExtras.push(mod);
      }
    }
    groups.set(placement.hero, group);
  }

  return groups;
}

export type HeroAssignCandidate<T> = {
  mod: T;
  kind: HeroModKind;
  /** The hero it resolves to today, or null when nothing recognised one. */
  currentHero: string | null;
  /** It was taken off a list rather than never recognised. */
  hidden: boolean;
};

/** Unrecognised first, then what was removed from a list, then everything else. */
const assignRank = (candidate: HeroAssignCandidate<unknown>) =>
  candidate.currentHero === null ? 0 : candidate.hidden ? 1 : 2;

/**
 * Everything in the library the user could hand to `hero`: mods no hero was ever
 * found for, mods removed from a list, and mods sitting under another hero.
 * Ordered by how likely each is to be what they came looking for.
 */
export function heroAssignCandidates<T extends HeroSelectableMod>(
  mods: T[],
  hero: string,
  hidden: ReadonlySet<string>,
): HeroAssignCandidate<T>[] {
  const candidates: HeroAssignCandidate<T>[] = [];

  for (const mod of mods) {
    const kind = KIND_BY_CATEGORY.get(mod.category);
    if (!kind || !SELECTABLE_STATUSES.has(mod.status)) {
      continue;
    }

    const isHidden = hidden.has(mod.remoteId);
    const currentHero = resolveLocalModHero(mod).hero;
    if (currentHero === hero && !isHidden) {
      continue;
    }

    candidates.push({ mod, kind, currentHero, hidden: isHidden });
  }

  return candidates.sort(
    (a, b) =>
      assignRank(a) - assignRank(b) || a.mod.name.localeCompare(b.mod.name),
  );
}
