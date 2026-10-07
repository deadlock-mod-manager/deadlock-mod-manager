/**
 * The bravery half of the roll: self-imposed rules that turn a random build
 * into a run. Nothing here changes what you are allowed to buy, so a roll stays
 * playable even when every rule is in effect.
 *
 * Titles and details live in the `tool-randomizer` namespace under
 * `challenges.<id>`. The order matters: the roll shuffles this list, so
 * reordering it would hand an existing seed different rules.
 */
const CHALLENGE_IDS = [
  "exactOrder",
  "noRecall",
  "parry",
  "noZipline",
  "meleeOpening",
  "ultOnCooldown",
  "noRetreat",
  "soulCap",
  "oneLane",
  "noCancel",
  "callout",
  "noHeal",
] as const;

type ChallengeId = (typeof CHALLENGE_IDS)[number];

export interface Challenge {
  id: ChallengeId;
}

export const CHALLENGES: Challenge[] = CHALLENGE_IDS.map((id) => ({ id }));
