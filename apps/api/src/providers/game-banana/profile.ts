import type { DeadlockHeroes, GameBanana } from "@deadlock-mods/shared";
import { heroRegistry } from "@deadlock-mods/shared";

type GameBananaProfileForCategory =
  | GameBanana.GameBananaModProfile
  | GameBanana.GameBananaSoundProfile;

export function categoryFromGameBananaProfile(
  profile: GameBananaProfileForCategory,
): string {
  const superName = profile._aSuperCategory?._sName;
  if (superName !== undefined && superName.length > 0) {
    return superName;
  }
  const rootName = profile._aRootCategory?._sName;
  if (rootName !== undefined && rootName.length > 0) {
    return rootName;
  }
  return profile._aCategory?._sName?.trim() || "Other";
}

export function heroFromGameBananaProfile(
  profile: GameBananaProfileForCategory,
): DeadlockHeroes | null {
  return heroRegistry.resolveFromSkinCategory(
    profile._aSuperCategory?._sName,
    profile._aCategory?._sName,
    profile._sName,
  );
}

export function submitterDisplayName(
  profile: GameBananaProfileForCategory,
): string {
  return profile._aSubmitter?._sName?.trim() || "Unknown";
}

export const parseTags = (
  tags: GameBanana.GameBananaSubmission["_aTags"],
): string[] => {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((tag) => {
      if (typeof tag === "string") {
        return tag.trim();
      }
      if (tag && typeof tag === "object") {
        const title = typeof tag._sTitle === "string" ? tag._sTitle.trim() : "";
        const value = typeof tag._sValue === "string" ? tag._sValue.trim() : "";
        return [title, value].filter((part) => part.length > 0).join(" ");
      }
      return "";
    })
    .filter((tag) => tag.length > 0);
};
