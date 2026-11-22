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
  | "detectedContent"
  | "heroOverride"
>;

export type HeroModKind = "skin" | "sound" | "extra";

const KIND_BY_CATEGORY = new Map<string, HeroModKind>([
  [ModCategory.SKINS, "skin"],
  [ModCategory.MODEL_REPLACEMENT, "skin"],
  [ModCategory.ABILITY_SOUNDS, "sound"],
  [ModCategory.VOICE_LINES, "sound"],
  [ModCategory.WEAPON_SOUNDS, "extra"],
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
  sounds: T[];
  extras: T[];
  activeSkins: T[];
  activeSounds: T[];
  activeExtras: T[];
};

export type HeroModOptions = {
  includeExtras: boolean;
  hidden: ReadonlySet<string>;
};

const emptyGroup = <T>(): HeroModGroup<T> => ({
  skins: [],
  sounds: [],
  extras: [],
  activeSkins: [],
  activeSounds: [],
  activeExtras: [],
});

const kindOf = (mod: HeroSelectableMod): HeroModKind | undefined => {
  const kind = KIND_BY_CATEGORY.get(mod.category);
  return kind === "skin" && mod.detectedContent === "sound" ? "sound" : kind;
};

const placeHeroMod = (
  mod: HeroSelectableMod,
  { includeExtras, hidden }: HeroModOptions,
): { hero: string; kind: HeroModKind } | null => {
  const kind = kindOf(mod);
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
    const isActive = mod.status === ModStatus.Installed;
    if (placement.kind === "skin") {
      group.skins.push(mod);
      if (isActive) group.activeSkins.push(mod);
    } else if (placement.kind === "sound") {
      group.sounds.push(mod);
      if (isActive) group.activeSounds.push(mod);
    } else {
      group.extras.push(mod);
      if (isActive) group.activeExtras.push(mod);
    }
    groups.set(placement.hero, group);
  }

  return groups;
}

export type HeroAssignCandidate<T> = {
  mod: T;
  kind: HeroModKind;
  currentHero: string | null;
  hidden: boolean;
};

const assignRank = (candidate: HeroAssignCandidate<unknown>) =>
  candidate.currentHero === null ? 0 : candidate.hidden ? 1 : 2;

export function heroAssignCandidates<T extends HeroSelectableMod>(
  mods: T[],
  hero: string,
  hidden: ReadonlySet<string>,
): HeroAssignCandidate<T>[] {
  const candidates: HeroAssignCandidate<T>[] = [];

  for (const mod of mods) {
    const kind = kindOf(mod);
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
