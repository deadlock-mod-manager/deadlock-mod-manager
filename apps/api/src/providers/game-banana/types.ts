import type { GameBanana } from "@deadlock-mods/shared";

export type GameBananaSubmissionSource = "featured" | "top" | "all" | "sound";
export type GameBananaSubmission =
  | GameBanana.GameBananaSubmission
  | GameBanana.GameBananaTopSubmission
  | GameBanana.GameBananaIndexSubmission
  | GameBanana.GameBananaSoundSubmission;
