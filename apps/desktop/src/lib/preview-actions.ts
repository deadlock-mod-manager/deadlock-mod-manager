import type { HeroAbility } from "@/lib/deadlock-api";
import type { PreviewAnimationChoice } from "@/types/generated/PreviewAnimationChoice";

const ABILITY_PREFIX = "ability:";

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * How surely a clip stem names the ability in `slot`: 2 when it is a whole word
 * of the class or display name (`leap` in `bull_leap`), 1 when it is part of
 * one (`djinnsmark` in "Djinn's Mark"), 0 otherwise. Clips call the ultimate
 * `ult` whatever the ability is named.
 */
const stemScore = (
  stem: string,
  ability: HeroAbility,
  slot: number,
): number => {
  if (stem === "ult") return slot === 3 ? 2 : 0;
  const words = [
    ...ability.className.split("_"),
    ...ability.name.split(/[^a-zA-Z0-9]+/),
  ].map(squash);
  if (words.includes(stem)) return 2;
  const names = [squash(ability.className), squash(ability.name)];
  return stem.length >= 4 && names.some((name) => name.includes(stem)) ? 1 : 0;
};

export interface AbilitySlot {
  ability: HeroAbility;
  action: PreviewAnimationChoice | null;
}

interface AbilityAssignment {
  slots: AbilitySlot[];
  /** Ability actions no slot claimed, still offered as plain chips. */
  rest: PreviewAnimationChoice[];
}

/**
 * Puts each ability action on the hero's ability it animates. Clip names only
 * loosely follow the ability names, so an action goes to a slot only when it
 * matches that slot better than every other; `shiv_*` clips, which name all
 * four, stay unassigned. Whatever is left over is returned as `rest`.
 */
export const assignAbilitySlots = (
  actions: PreviewAnimationChoice[],
  abilities: HeroAbility[],
): AbilityAssignment => {
  const slots: AbilitySlot[] = abilities.map((ability) => ({
    ability,
    action: null,
  }));
  const rest: PreviewAnimationChoice[] = [];
  for (const action of actions) {
    if (action.kind !== "ability") continue;
    const stem = action.id.startsWith(ABILITY_PREFIX)
      ? action.id.slice(ABILITY_PREFIX.length)
      : "";
    const scores = abilities.map((ability, slot) =>
      stem ? stemScore(stem, ability, slot) : 0,
    );
    const best = Math.max(0, ...scores);
    const target =
      best > 0 && scores.filter((score) => score === best).length === 1
        ? slots[scores.indexOf(best)]
        : undefined;
    if (target && !target.action) target.action = action;
    else rest.push(action);
  }
  return { slots, rest };
};
