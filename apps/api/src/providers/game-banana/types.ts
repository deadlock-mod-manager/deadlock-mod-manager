import type { GameBanana } from "@deadlock-mods/shared";

export type GameBananaSubmissionSource = "all" | "sound";
/** Profile hydration accepts an ID; index context is available only for listings. */
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
/** Why a profile produced no payload: a 404, or private, withheld, or another game. */
export type GameBananaProfileSkip = "not_found" | "unavailable";
