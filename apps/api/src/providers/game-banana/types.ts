import type { GameBanana } from "@deadlock-mods/shared";

export type GameBananaSubmissionSource = "all" | "sound";
export interface GameBananaSubmission {
  _idRow: GameBanana.GameBananaSubmission["_idRow"];
  _tsDateModified?: GameBanana.GameBananaSubmission["_tsDateModified"];
  _aRootCategory?: Pick<
    GameBanana.GameBananaSubmission["_aRootCategory"],
    "_sName"
  >;
}
export type GameBananaListedSubmission =
  | GameBanana.GameBananaIndexSubmission
  | GameBanana.GameBananaSoundSubmission;
export type GameBananaProfileSkip = "not_found" | "unavailable";
