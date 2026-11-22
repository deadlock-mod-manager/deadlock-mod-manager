import type { ModDto } from "@deadlock-mods/shared";
import { guessHero, normalizeHero } from "@deadlock-mods/shared";
import type { LocalMod } from "@/types/mods";

export type ResolvedHeroSource = "manual" | "api" | "name" | "vpk" | "none";

export type ResolvedModHero = {
  hero: string | null;
  source: ResolvedHeroSource;
  hasOverride: boolean;
};

type HeroResolvableMod = Pick<ModDto, "hero" | "name">;
type HeroResolvableLocalMod = Pick<LocalMod, "detectedHero" | "heroOverride">;
type LocalHeroMod = HeroResolvableMod & HeroResolvableLocalMod;

export function resolveModHero(
  mod: HeroResolvableMod,
  localMod?: HeroResolvableLocalMod | null,
): ResolvedModHero {
  if (localMod && "heroOverride" in localMod) {
    const { heroOverride } = localMod;
    if (heroOverride !== undefined) {
      // Preserve unknown manual overrides so imported or future hero values remain visible.
      return {
        hero: normalizeHero(heroOverride) ?? heroOverride,
        source: "manual",
        hasOverride: true,
      };
    }
  }

  const apiHero = normalizeHero(mod.hero);
  if (apiHero) {
    return {
      hero: apiHero,
      source: "api",
      hasOverride: false,
    };
  }

  const nameHero = guessHero(mod.name);
  if (nameHero) {
    return {
      hero: nameHero,
      source: "name",
      hasOverride: false,
    };
  }

  const vpkHero = normalizeHero(localMod?.detectedHero);
  if (vpkHero) {
    return {
      hero: vpkHero,
      source: "vpk",
      hasOverride: false,
    };
  }

  return {
    hero: null,
    source: "none",
    hasOverride: false,
  };
}

export function resolveLocalModHero(mod: LocalHeroMod): ResolvedModHero {
  return resolveModHero(mod, mod);
}

export function matchesHeroFilter(
  resolvedHero: string | null,
  selectedHeroes: string[],
): boolean {
  if (selectedHeroes.includes("None")) {
    return !resolvedHero || selectedHeroes.includes(resolvedHero);
  }
  return !!resolvedHero && selectedHeroes.includes(resolvedHero);
}
