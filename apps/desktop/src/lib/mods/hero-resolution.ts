import type { ModDto } from "@deadlock-mods/shared";
import { guessHero, normalizeHero } from "@deadlock-mods/shared";
import type { LocalMod } from "@/types/mods";

export type ResolvedHeroSource = "manual" | "api" | "name" | "vpk" | "none";

export type ResolvedModHero = {
  hero: string | null;
  source: ResolvedHeroSource;
  isManual: boolean;
  hasOverride: boolean;
};

type HeroResolvableMod = Pick<ModDto, "hero" | "name">;
type HeroResolvableLocalMod = Pick<LocalMod, "detectedHero" | "heroOverride">;

export function resolveModHero(
  mod: HeroResolvableMod,
  localMod?: HeroResolvableLocalMod | null,
): ResolvedModHero {
  if (localMod && "heroOverride" in localMod) {
    const { heroOverride } = localMod;
    if (heroOverride !== undefined) {
      return {
        hero: normalizeHero(heroOverride) ?? heroOverride,
        source: "manual",
        isManual: true,
        hasOverride: true,
      };
    }
  }

  const apiHero = normalizeHero(mod.hero);
  if (apiHero) {
    return {
      hero: apiHero,
      source: "api",
      isManual: false,
      hasOverride: false,
    };
  }

  const nameHero = guessHero(mod.name);
  if (nameHero) {
    return {
      hero: nameHero,
      source: "name",
      isManual: false,
      hasOverride: false,
    };
  }

  const vpkHero = normalizeHero(localMod?.detectedHero);
  if (vpkHero) {
    return {
      hero: vpkHero,
      source: "vpk",
      isManual: false,
      hasOverride: false,
    };
  }

  return {
    hero: null,
    source: "none",
    isManual: false,
    hasOverride: false,
  };
}
