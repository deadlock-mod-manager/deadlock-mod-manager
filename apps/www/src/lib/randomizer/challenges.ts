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
