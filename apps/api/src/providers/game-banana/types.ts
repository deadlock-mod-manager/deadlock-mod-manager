import type { GameBanana } from "@deadlock-mods/shared";

export type GameBananaSubmissionSource = "all" | "sound";
export type GameBananaSubmission =
  | GameBanana.GameBananaSubmission
  | GameBanana.GameBananaIndexSubmission
  | GameBanana.GameBananaSoundSubmission;
export type GameBananaListedSubmission =
  | GameBanana.GameBananaIndexSubmission
  | GameBanana.GameBananaSoundSubmission;
/** Why a profile produced no payload: a 404, or private, withheld, or another game. */
export type GameBananaProfileSkip = "not_found" | "unavailable";
