import type { HeroAbility } from "@/lib/deadlock-api";
import type { PreviewAnimationChoice } from "@/types/generated/PreviewAnimationChoice";

const ABILITY_PREFIX = "ability:";

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * How surely `part` of a clip stem names the ability in `slot`: 2 when it is a
 * whole word of the class or display name (`leap` in `bull_leap`) or the whole
 * name (`hyperbeam` for "Hyper Beam"), 1 when it is part of one (`djinnsmark`
 * in "Djinn's Mark") or a word in the plural (`leeches` for "Leech Therapy"),
 * 0 otherwise. Clips call the ultimate `ult` whatever the ability is named.
 */
const partScore = (
  part: string,
  ability: HeroAbility,
  slot: number,
): number => {
  if (part === "ult") return slot === 3 ? 2 : 0;
  const words = [
    ...ability.className.split("_"),
    ...ability.name.split(/[^a-zA-Z0-9]+/),
  ].map(squash);
  const squashed = squash(part);
  const names = [squash(ability.className), squash(ability.name)];
  if (words.includes(squashed) || names.includes(squashed)) return 2;
  if (squashed.length < 4) return 0;
  return names.some((name) => name.includes(squashed)) ||
    words.some(
      (word) =>
        word.length >= 4 &&
        squashed.startsWith(word) &&
        squashed.length - word.length <= 2,
    )
    ? 1
    : 0;
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

interface Candidate {
  action: PreviewAnimationChoice;
  /** The slot it matches better than every other, or -1. */
  slot: number;
  /** Whether the whole stem matched, rather than only some of its words. */
  whole: boolean;
}

const uniqueBest = (scores: number[]): number => {
  const best = Math.max(0, ...scores);
  return best > 0 && scores.filter((score) => score === best).length === 1
    ? scores.indexOf(best)
    : -1;
};

/**
 * Matches the whole stem first. When it names no slot, each of its words of
 * three letters or more is scored and summed, since clips often add a word the
 * ability name lacks (`stalker_claw` for "Stalker's Mark", `superslash_ult`
 * for an ultimate).
 */
const candidate = (
  action: PreviewAnimationChoice,
  abilities: HeroAbility[],
): Candidate => {
  const stem = action.id.startsWith(ABILITY_PREFIX)
    ? action.id.slice(ABILITY_PREFIX.length)
    : "";
  // Clips found by an ability's name belong to that ability outright.
  if (action.ability)
    return {
      action,
      slot: abilities.findIndex((ability) => ability.name === action.ability),
      whole: true,
    };
  if (!stem) return { action, slot: -1, whole: false };
  const whole = abilities.map((ability, slot) =>
    partScore(stem, ability, slot),
  );
  if (whole.some((score) => score > 0))
    return { action, slot: uniqueBest(whole), whole: true };
  const parts = abilities.map((ability, slot) =>
    stem
      .split("_")
      .filter((part) => part.length >= 3)
      .reduce((total, part) => total + partScore(part, ability, slot), 0),
  );
  return { action, slot: uniqueBest(parts), whole: false };
};

/**
 * Puts each ability action on the hero's ability it animates. Clip names only
 * loosely follow the ability names, so an action goes to a slot only when it
 * matches that slot better than every other; `shiv_*` clips, which name all
 * four, stay unassigned. Whole-stem matches claim slots first, so `sentry`
 * beats `idle_sentry` to Mini Turret. Whatever is left over is returned as
 * `rest`.
 */
export const assignAbilitySlots = (
  actions: PreviewAnimationChoice[],
  abilities: HeroAbility[],
): AbilityAssignment => {
  const slots: AbilitySlot[] = abilities.map((ability) => ({
    ability,
    action: null,
  }));
  const candidates = actions
    .filter((action) => action.kind === "ability")
    .map((action) => candidate(action, abilities));
  const claimed = new Set<PreviewAnimationChoice>();
  for (const whole of [true, false]) {
    for (const entry of candidates) {
      const target = slots[entry.slot];
      if (entry.whole !== whole || !target || target.action) continue;
      target.action = entry.action;
      claimed.add(entry.action);
    }
  }
  const rest = candidates
    .map((entry) => entry.action)
    .filter((action) => !claimed.has(action));
  return { slots, rest };
};
