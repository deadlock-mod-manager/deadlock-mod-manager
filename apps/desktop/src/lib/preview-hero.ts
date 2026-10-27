import type { HeroAbility, HeroAbilitySet } from "./deadlock-api";
import type { PreviewModelAbility } from "@/types/generated/PreviewModelAbility";

const normalizedClass = (name: string) => name.replace(/^citadel_ability_/, "");

export const previewHeroAbilities = (
  entryPath: string,
  local: PreviewModelAbility[] | undefined,
  remote: HeroAbilitySet[],
): HeroAbility[] => {
  if (local?.length) {
    const byClass = new Map(
      remote
        .flatMap((hero) => hero.abilities)
        .map((ability) => [normalizedClass(ability.className), ability]),
    );
    return local.map((ability) => {
      const details = byClass.get(normalizedClass(ability.className));
      return {
        ...ability,
        name: details?.name ?? ability.name,
        image: details?.image ?? null,
      };
    });
  }
  return (
    remote
      .filter((hero) => entryPath.startsWith(hero.modelDirectory))
      .sort((a, b) => b.modelDirectory.length - a.modelDirectory.length)[0]
      ?.abilities ?? []
  );
};
