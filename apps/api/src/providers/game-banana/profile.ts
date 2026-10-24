import type { DeadlockHeroes, GameBanana } from "@deadlock-mods/shared";
import { heroRegistry, SKINS_SUPER_CATEGORY } from "@deadlock-mods/shared";
import { DEADLOCK_GAME_ID } from "./constants";

type GameBananaProfileForCategory =
  | GameBanana.GameBananaModProfile
  | GameBanana.GameBananaSoundProfile;

// Profile pages omit _aRootCategory despite the shared submission type.
type GameBananaProfileCategories = Pick<
  GameBananaProfileForCategory,
  "_sName" | "_aCategory" | "_aSuperCategory"
> &
  Partial<Pick<GameBananaProfileForCategory, "_aRootCategory">>;

/**
 * Profiles only carry the category and its parent, so pass the index record's
 * root category when the caller has it: skin subcategories sit a level deeper
 * (Skins > hero > style), where the parent is the hero, not "Skins".
 */
export function categoryFromGameBananaProfile(
  profile: GameBananaProfileCategories,
  rootCategoryName?: string,
): string {
  if (rootCategoryName) {
    return rootCategoryName;
  }
  const superName = profile._aSuperCategory?._sName;
  if (superName !== undefined && superName.length > 0) {
    return heroRegistry.normalize(superName) ? SKINS_SUPER_CATEGORY : superName;
  }
  const rootName = profile._aRootCategory?._sName;
  if (rootName !== undefined && rootName.length > 0) {
    return rootName;
  }
  return profile._aCategory?._sName?.trim() || "Other";
}

export function heroFromGameBananaProfile(
  profile: GameBananaProfileCategories,
  rootCategoryName?: string,
): DeadlockHeroes | null {
  return heroRegistry.resolveFromSkinCategory(
    {
      root: rootCategoryName,
      parent: profile._aSuperCategory?._sName,
      category: profile._aCategory?._sName,
    },
    profile._sName,
  );
}

export function submitterDisplayName(
  profile: GameBananaProfileForCategory,
): string {
  return profile._aSubmitter?._sName?.trim() || "Unknown";
}

/**
 * Private and withheld submissions come back as a stub carrying a name and a
 * few flags: no URL, author, dates, files or images. There is nothing worth
 * publishing, and the missing URL fails the `remote_url` not-null constraint.
 */
export function isUnavailableProfile(
  profile: GameBananaProfileForCategory,
): boolean {
  return (
    profile._bIsPrivate === true ||
    profile._bIsWithheld === true ||
    (profile._aGame !== undefined && profile._aGame._idRow !== DEADLOCK_GAME_ID)
  );
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
